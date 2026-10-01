"""Static content validation: every rule of Section 10.7 except rule 7 (D8).

Rule 7 (each reference solution passes its tests) executes content code, so it runs only
in scripts/validate_content.py. The API runs everything here at startup and refuses to
start on errors. Beyond the numbered rules this checks every cross reference (patterns,
structures, toolkit cards, related problems, roadmap prerequisites, viz events and
variables) and the shape of typed parameters (`io`), design tests and checkers, so a typo
fails here instead of in a user's browser.
"""

import ast
import dis
import inspect
import json
import re
import warnings
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from types import CodeType
from typing import Any, Literal

from pydantic import TypeAdapter, ValidationError
from pydantic_core import ErrorDetails

from app.content.models import (
    BRUTE_FORCE,
    NODE_IO_TYPES,
    OPTIMAL,
    REF_KEY,
    SLOT_IDS,
    Pattern,
    Problem,
    Roadmap,
    Structure,
    TestCase,
    ToolkitCard,
    VizConfig,
)

PATTERNS_FILE = "patterns.json"
ROADMAP_FILE = "roadmap.json"
STRUCTURES_FILE = "structures.json"
TOOLKIT_FILE = "toolkit.json"
PROBLEMS_DIR = "problems"
REQUIRED_FILES = (PATTERNS_FILE, ROADMAP_FILE, STRUCTURES_FILE, TOOLKIT_FILE)

SUMMARY_WARN_CHARS = 450
MIN_VISIBLE_TESTS = 2
MIN_HIDDEN_TESTS = 3
MAX_PREDICT = 3
# Workspace problems use their Section 24.2 number; drill-only problems count up from here.
DRILL_ORDER_START = 101
# The tracer's marker syntax (Section 8.2).
MARKER_RE = re.compile(r"#\s*viz:([a-zA-Z0-9_]+)")
TOOLKIT_PREFIX = "toolkit:"
STRUCTURE_PREFIX = "structure:"
# The only builtins the Section 8.2 tracer gives narration (`say`) and conditions
# (`when`, and predict `answerWhen`, which it evaluates as an extra event condition).
SAY_BUILTINS = frozenset({"repr", "len"})
CONDITION_BUILTINS = frozenset({"len"})
# Compare modes that reorder a list; a design test's result is one value per call, in order.
UNORDERED_MODES = ("unordered", "unordered_nested")
CHECK_FUNCTION = "check"

Level = Literal["error", "warning"]

_PATTERNS = TypeAdapter(list[Pattern])
_ROADMAP = TypeAdapter(Roadmap)
_STRUCTURES = TypeAdapter(list[Structure])
_TOOLKIT = TypeAdapter(list[ToolkitCard])
_PROBLEM = TypeAdapter(Problem)


@dataclass(frozen=True, slots=True)
class Issue:
    level: Level
    file: str  # relative to the content folder, e.g. "problems/two-sum.json"
    path: str  # where in the file, e.g. "approaches[1].patternId"; "" for the whole file
    message: str

    def __str__(self) -> str:
        where = f"{self.file}: {self.path}" if self.path else self.file
        return f"{self.level}: {where}: {self.message}"


@dataclass
class ContentSet:
    """Everything that parsed. A top-level file that is missing or invalid stays None."""

    patterns: list[Pattern] | None = None
    roadmap: Roadmap | None = None
    structures: list[Structure] | None = None
    toolkit: list[ToolkitCard] | None = None
    problems: dict[str, Problem] = field(default_factory=dict)  # by file name


@dataclass
class ValidationResult:
    content: ContentSet
    issues: list[Issue]

    @property
    def errors(self) -> list[Issue]:
        return [issue for issue in self.issues if issue.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [issue for issue in self.issues if issue.level == "warning"]


def read_content_files(content_dir: Path) -> dict[str, bytes]:
    """Every `*.json` under `content_dir`, keyed by its relative POSIX path."""
    if not content_dir.is_dir():
        return {}
    return {
        path.relative_to(content_dir).as_posix(): path.read_bytes()
        for path in sorted(p for p in content_dir.rglob("*.json") if p.is_file())
    }


def validate_content_dir(content_dir: Path) -> ValidationResult:
    if not content_dir.is_dir():
        missing = Issue("error", str(content_dir), "", "content folder not found")
        return ValidationResult(ContentSet(), [missing])
    return validate_files(read_content_files(content_dir))


def validate_files(files: Mapping[str, bytes]) -> ValidationResult:
    """Validate content given as {relative path: file bytes}."""
    return _Validator(files).run()


def is_problem_file(name: str) -> bool:
    parts = PurePosixPath(name).parts
    return len(parts) == 2 and parts[0] == PROBLEMS_DIR and parts[1].endswith(".json")


# ---------------------------------------------------------------- JSON and model errors


class _DuplicateKey(ValueError):
    pass


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise _DuplicateKey(f"duplicate key {key!r}")
        obj[key] = value
    return obj


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not valid JSON")


def _format_loc(loc: Sequence[int | str]) -> str:
    out = ""
    for part in loc:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else part)
    return out


def _message(error: ErrorDetails) -> str:
    if error["type"] == "extra_forbidden":
        return "unknown key"
    if error["type"] == "missing":
        return "required"
    return error["msg"].removeprefix("Value error, ")


# ---------------------------------------------------------------- code helpers


def parse_code(code: str) -> ast.Module | SyntaxError:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # e.g. SyntaxWarning for "\d" in a string
        try:
            return ast.parse(code)
        except SyntaxError as exc:
            return exc


@dataclass(frozen=True, slots=True)
class ParsedCode:
    tree: ast.Module
    compiled: CodeType  # compiled, never run


def compile_code(code: str) -> ParsedCode | SyntaxError:
    tree = parse_code(code)
    if isinstance(tree, SyntaxError):
        return tree
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:  # catches what the parser allows but the compiler rejects, e.g. a stray `return`
            return ParsedCode(tree, compile(tree, "<solution>", "exec"))
        except SyntaxError as exc:
            return exc


def _code_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
    return names


def _local_names(tree: ast.AST) -> set[str]:
    """Names the code binds, which are what a traced frame's locals can hold."""
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            names.add(node.name)
        elif isinstance(node, ast.alias):
            names.add(node.asname or node.name.partition(".")[0])
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    # The tracer leaves `self` out of the locals it evaluates against.
    return names - {"self"}


def _free_names(expression: ast.Expression) -> set[str]:
    """Names an expression reads but does not bind itself (as a comprehension does)."""
    return {
        node.id
        for node in ast.walk(expression)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
    } - _local_names(expression)


def marker_lines(code: str) -> dict[str, list[int]]:
    """Map each `# viz:<name>` marker to its line numbers, as the Section 8.2 tracer does:
    only the first marker on a line counts."""
    out: dict[str, list[int]] = {}
    for lineno, line in enumerate(code.splitlines(), start=1):
        if match := MARKER_RE.search(line):
            out.setdefault(match.group(1), []).append(lineno)
    return out


def traced_lines(compiled: CodeType) -> set[int]:
    """Lines on which the tracer gets a line event: lines with bytecode inside a function.

    Module and class bodies run before tracing starts, and a function's own prologue
    (up to its first RESUME) sits on its `def` line but never fires a line event. Comment-only
    lines and lines like `else:` hold no bytecode at all.
    """
    lines: set[int] = set()
    pending = [compiled]
    while pending:
        code = pending.pop()
        pending.extend(const for const in code.co_consts if isinstance(const, CodeType))
        if not code.co_flags & inspect.CO_OPTIMIZED:
            continue
        in_prologue = True
        for instruction in dis.get_instructions(code):
            if in_prologue:
                in_prologue = instruction.opname != "RESUME"
            elif instruction.positions is not None and instruction.positions.lineno is not None:
                lines.add(instruction.positions.lineno)
    return lines


def phrase_in_text(phrase: str, text: str) -> bool:
    """Rule 4: `phrase` appears in `text` as whole words, ignoring case. Punctuation may
    touch it, but not a letter, digit or underscore ("sorted" is not in "unsorted").

    Case is ignored letter by letter (`re.IGNORECASE`). Casefolding would change the text
    itself: `casefold()` turns "İ" into "i" plus a combining dot, which is not a word
    character, so "stanbul" would match inside "İstanbul".
    """
    pattern = rf"(?<!\w){re.escape(phrase)}(?!\w)"
    return re.search(pattern, text, re.IGNORECASE) is not None


def _duplicates(values: Iterable[str]) -> list[str]:
    return [value for value, count in Counter(values).items() if count > 1]


def _names(names: Sequence[str]) -> str:
    return ", ".join(names) or "none"


def _top_level(tree: ast.Module, name: str, kind: type[ast.AST]) -> Any:
    """The top-level class or function `name` of `tree`, or None."""
    return next(
        (n for n in tree.body if isinstance(n, kind) and getattr(n, "name", "") == name), None
    )


def _class_methods(tree: ast.Module, name: str) -> set[str] | None:
    """The methods class `name` defines; None when unknown (no such class, or it inherits)."""
    node = _top_level(tree, name, ast.ClassDef)
    if node is None or node.bases or node.keywords:
        return None
    methods = set()
    for item in node.body:
        if isinstance(item, ast.FunctionDef | ast.AsyncFunctionDef):
            methods.add(item.name)
        elif isinstance(item, ast.Assign):
            methods.update(t.id for t in item.targets if isinstance(t, ast.Name))
    return methods


def _entry_params(tree: ast.Module, entry: str) -> list[str] | None:
    """The parameters of Solution.<entry> after `self`; None if there is no such method."""
    solution = _top_level(tree, "Solution", ast.ClassDef)
    if solution is None:
        return None
    method = next(
        (
            n
            for n in solution.body
            if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef) and n.name == entry
        ),
        None,
    )
    if method is None:
        return None
    return [arg.arg for arg in [*method.args.posonlyargs, *method.args.args][1:]]


def _takes_two_args(function: ast.FunctionDef) -> bool:
    """Whether `function(args, got)` is a valid call."""
    arguments = function.args
    positional = [*arguments.posonlyargs, *arguments.args]
    required = len(positional) - len(arguments.defaults)
    keyword_only_required = any(default is None for default in arguments.kw_defaults)
    fits = len(positional) >= 2 or arguments.vararg is not None
    return fits and required <= 2 and not keyword_only_required


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _viz_variables(viz: VizConfig, path: str) -> Iterator[tuple[str, str]]:
    """Every variable name a viz config refers to, with its location."""
    yield f"{path}.primary", viz.primary
    for i, pointer in enumerate(viz.pointers):
        yield f"{path}.pointers[{i}].var", pointer.var
        yield f"{path}.pointers[{i}].into", pointer.into
    if viz.window is not None:
        for key in ("into", "start", "end"):
            yield f"{path}.window.{key}", getattr(viz.window, key)
    if viz.range is not None:
        for key in ("into", "lo", "hi", "mid"):
            if (name := getattr(viz.range, key)) is not None:
                yield f"{path}.range.{key}", name
    for role in ("stack", "queue", "hidden"):
        for i, name in enumerate(getattr(viz.roles, role)):
            yield f"{path}.roles.{role}[{i}]", name
    if viz.confirmed is not None:
        yield f"{path}.confirmed.into", viz.confirmed.into
        for i, name in enumerate(viz.confirmed.outside):
            yield f"{path}.confirmed.outside[{i}]", name
    for i, predict in enumerate(viz.predict):
        if predict.var is not None:
            yield f"{path}.predict[{i}].var", predict.var


def _find_cycle(graph: Mapping[str, Sequence[str]]) -> list[str] | None:
    """A prerequisite cycle as [a, b, ..., a], or None. Self-loops are reported separately."""
    visiting: list[str] = []
    done: set[str] = set()

    def visit(node: str) -> list[str] | None:
        visiting.append(node)
        for nxt in graph.get(node, ()):
            if nxt == node or nxt not in graph or nxt in done:
                continue
            if nxt in visiting:
                return [*visiting[visiting.index(nxt) :], nxt]
            if cycle := visit(nxt):
                return cycle
        visiting.pop()
        done.add(node)
        return None

    for node in graph:
        if node not in done and (cycle := visit(node)):
            return cycle
    return None


# ---------------------------------------------------------------- the rules


class _Validator:
    def __init__(self, files: Mapping[str, bytes]) -> None:
        self.files = files
        self.issues: list[Issue] = []
        self.content = ContentSet()

    def error(self, file: str, path: str, message: str) -> None:
        self.issues.append(Issue("error", file, path, message))

    def warn(self, file: str, path: str, message: str) -> None:
        self.issues.append(Issue("warning", file, path, message))

    def ref(self, known: set[str] | None, value: str, kind: str, file: str, path: str) -> None:
        # `known` is None when its file failed to load; that failure is already reported.
        if known is not None and value not in known:
            self.error(file, path, f"unknown {kind} {value!r}")

    def unique(self, file: str, path: str, values: Sequence[str], kind: str) -> None:
        for value in _duplicates(values):
            self.error(file, path, f"duplicate {kind} {value!r}")

    def run(self) -> ValidationResult:
        self.load()
        content = self.content
        self.patterns_by_id = (
            {p.id: p for p in content.patterns} if content.patterns is not None else None
        )
        self.pattern_ids = set(self.patterns_by_id) if self.patterns_by_id is not None else None
        self.structure_ids = (
            {s.id for s in content.structures} if content.structures is not None else None
        )
        self.toolkit_ids = {t.id for t in content.toolkit} if content.toolkit is not None else None
        self.problems_by_slug = {p.slug: p for p in content.problems.values()}
        # Problems whose file failed to parse still count as existing for `related`.
        self.known_slugs = {
            PurePosixPath(name).stem for name in self.files if is_problem_file(name)
        } | set(self.problems_by_slug)

        self.check_patterns()
        self.check_roadmap()
        self.check_structures()
        self.check_toolkit()
        self.check_problems()
        issues = sorted(self.issues, key=lambda issue: issue.file)  # stable: keeps rule order
        return ValidationResult(content, issues)

    # ---- rule 1: every file parses and matches its model

    def load(self) -> None:
        for name, raw in self.files.items():
            if name == PATTERNS_FILE:
                self.content.patterns = self.parse(name, raw, _PATTERNS)
            elif name == ROADMAP_FILE:
                self.content.roadmap = self.parse(name, raw, _ROADMAP)
            elif name == STRUCTURES_FILE:
                self.content.structures = self.parse(name, raw, _STRUCTURES)
            elif name == TOOLKIT_FILE:
                self.content.toolkit = self.parse(name, raw, _TOOLKIT)
            elif is_problem_file(name):
                if (problem := self.parse(name, raw, _PROBLEM)) is not None:
                    self.content.problems[name] = problem
            else:
                self.error(
                    name,
                    "",
                    "unknown content file (expected patterns.json, roadmap.json, "
                    "structures.json, toolkit.json or problems/<slug>.json)",
                )
        for name in REQUIRED_FILES:
            if name not in self.files:
                self.error(name, "", "missing required file")

    def parse[T](self, name: str, raw: bytes, adapter: TypeAdapter[T]) -> T | None:
        try:
            data = json.loads(
                raw.decode("utf-8"),
                object_pairs_hook=_object_without_duplicate_keys,
                parse_constant=_reject_constant,
            )
        except ValueError as exc:  # includes UnicodeDecodeError and JSONDecodeError
            self.error(name, "", f"not valid JSON: {exc}")
            return None
        try:
            return adapter.validate_python(data)
        except ValidationError as exc:
            for error in exc.errors(include_url=False):
                self.error(name, _format_loc(error["loc"]), _message(error))
            return None

    # ---- patterns.json

    def check_patterns(self) -> None:
        patterns = self.content.patterns
        if patterns is None:
            return
        file = PATTERNS_FILE
        seen: set[str] = set()
        for i, pattern in enumerate(patterns):
            at = f"[{i}]"
            if pattern.id in seen:
                self.error(file, f"{at}.id", f"duplicate pattern id {pattern.id!r}")
            seen.add(pattern.id)
            slot_ids = tuple(slot.id for slot in pattern.slots)
            if slot_ids != SLOT_IDS:
                self.error(
                    file,
                    f"{at}.slots",
                    f"slots must be {', '.join(SLOT_IDS)} in this order "
                    f"(found {', '.join(slot_ids) or 'none'})",
                )
            for slot_id in SLOT_IDS:
                comment = f"# {slot_id.upper()}"
                count = len(re.findall(rf"#\s*{slot_id.upper()}\b", pattern.template))
                if count == 0:
                    self.warn(file, f"{at}.template", f"no '{comment}' slot comment")
                elif count > 1:
                    self.warn(
                        file, f"{at}.template", f"'{comment}' appears {count} times; use it once"
                    )
            self.unique(file, f"{at}.toolkit", pattern.toolkit, "toolkit id")
            for j, toolkit_id in enumerate(pattern.toolkit):
                self.ref(self.toolkit_ids, toolkit_id, "toolkit id", file, f"{at}.toolkit[{j}]")
            self.check_pattern_toolkit(at, pattern)
            demo = pattern.demo
            parsed = self.check_code(file, f"{at}.demo.code", demo.code, demo.entry)
            self.check_viz(file, f"{at}.demo.viz", demo.viz, f"{at}.demo.code", demo.code, parsed)

    def check_pattern_toolkit(self, at: str, pattern: Pattern) -> None:
        """A pattern lists exactly the toolkit cards tagged with it (the pattern page and the
        drills read one or the other)."""
        if self.content.toolkit is None:
            return
        known = {card.id for card in self.content.toolkit}
        tagged = {card.id for card in self.content.toolkit if pattern.id in card.patterns}
        listed = set(pattern.toolkit)
        problems = []
        if missing := sorted(tagged - listed):
            problems.append(f"missing {', '.join(missing)}")
        # An unknown id is reported on its own.
        if untagged := sorted((listed - tagged) & known):
            problems.append(f"{', '.join(untagged)} not tagged {pattern.id!r} in {TOOLKIT_FILE}")
        if problems:
            self.error(
                PATTERNS_FILE,
                f"{at}.toolkit",
                f"must list exactly the toolkit cards tagged {pattern.id!r}: {'; '.join(problems)}",
            )

    # ---- roadmap.json

    def check_roadmap(self) -> None:
        roadmap = self.content.roadmap
        if roadmap is None:
            return
        file = ROADMAP_FILE
        node_ids = {node.id for node in roadmap.patterns}
        seen: set[str] = set()
        positions: dict[tuple[int, int], str] = {}
        for i, node in enumerate(roadmap.patterns):
            at = f"patterns[{i}]"
            if node.id in seen:
                self.error(file, f"{at}.id", f"duplicate roadmap id {node.id!r}")
            seen.add(node.id)
            self.ref(self.pattern_ids, node.id, "pattern id", file, f"{at}.id")
            self.unique(file, f"{at}.prereqs", node.prereqs, "prereq")
            for j, prereq in enumerate(node.prereqs):
                if prereq == node.id:
                    self.error(file, f"{at}.prereqs[{j}]", "a pattern cannot be its own prereq")
                elif prereq not in node_ids:
                    self.error(file, f"{at}.prereqs[{j}]", f"{prereq!r} is not in the roadmap")
            position = (node.x, node.y)
            if position in positions:
                self.warn(file, at, f"same x/y position as {positions[position]!r}")
            positions.setdefault(position, node.id)
        for pattern in self.content.patterns or ():
            if pattern.id not in node_ids:
                self.error(file, "patterns", f"pattern {pattern.id!r} is missing from the roadmap")
        cycle = _find_cycle({node.id: node.prereqs for node in roadmap.patterns})
        if cycle:
            self.error(file, "patterns", f"prereqs form a cycle: {' -> '.join(cycle)}")

    # ---- structures.json and toolkit.json

    def check_structures(self) -> None:
        seen: set[str] = set()
        for i, structure in enumerate(self.content.structures or ()):
            if structure.id in seen:
                self.error(STRUCTURES_FILE, f"[{i}].id", f"duplicate structure id {structure.id!r}")
            seen.add(structure.id)

    def check_toolkit(self) -> None:
        seen: set[str] = set()
        # Toolkit drills (M5) need exactly one right card per phrase.
        phrase_cards: dict[str, str] = {}
        for i, card in enumerate(self.content.toolkit or ()):
            if card.id in seen:
                self.error(TOOLKIT_FILE, f"[{i}].id", f"duplicate toolkit id {card.id!r}")
            seen.add(card.id)
            for j, phrase in enumerate(card.phrases):
                key = phrase.strip().casefold()
                if key in phrase_cards:
                    self.error(
                        TOOLKIT_FILE,
                        f"[{i}].phrases[{j}]",
                        f"{phrase!r} is already a phrase of {phrase_cards[key]!r}; a phrase "
                        "belongs to one card",
                    )
                phrase_cards.setdefault(key, card.id)
            self.unique(TOOLKIT_FILE, f"[{i}].patterns", card.patterns, "pattern id")
            for j, pattern_id in enumerate(card.patterns):
                self.ref(
                    self.pattern_ids, pattern_id, "pattern id", TOOLKIT_FILE, f"[{i}].patterns[{j}]"
                )

    # ---- problems/<slug>.json

    def check_problems(self) -> None:
        slug_files: dict[str, str] = {}
        order_files: dict[int, str] = {}
        for name, problem in sorted(self.content.problems.items()):
            self.check_problem(name, problem)
            if problem.slug in slug_files:
                self.error(name, "slug", f"slug also used by {slug_files[problem.slug]}")
            slug_files.setdefault(problem.slug, name)
            if problem.order in order_files:
                self.error(name, "order", f"order also used by {order_files[problem.order]}")
            order_files.setdefault(problem.order, name)
            if problem.drill_only and problem.order < DRILL_ORDER_START:
                self.error(
                    name,
                    "order",
                    f"drill-only problems are numbered from {DRILL_ORDER_START}, in the order "
                    "of the Section 24.2 drill-only table",
                )
            elif not problem.drill_only and problem.order >= DRILL_ORDER_START:
                self.error(
                    name,
                    "order",
                    f"a Workspace problem's order is its Section 24.2 number (below "
                    f"{DRILL_ORDER_START})",
                )

    def check_problem(self, file: str, problem: Problem) -> None:
        stem = PurePosixPath(file).stem
        if problem.slug != stem:  # rule 2
            self.error(file, "slug", f"{problem.slug!r} must equal the file name {stem!r}")
        self.ref(self.pattern_ids, problem.pattern_id, "pattern id", file, "patternId")  # rule 3
        self.check_approaches(file, problem)
        self.check_signals(file, problem)
        self.check_hints(file, problem)

        solution: ParsedCode | None = None
        starter: ParsedCode | None = None
        entry, kind = problem.entry, problem.kind
        if problem.solution is not None:
            self.unique(file, "solution.toolkit", problem.solution.toolkit, "toolkit id")
            for j, toolkit_id in enumerate(problem.solution.toolkit):
                self.ref(self.toolkit_ids, toolkit_id, "toolkit id", file, f"solution.toolkit[{j}]")
            code = problem.solution.code
            solution = self.check_code(file, "solution.code", code, entry, kind)
        if problem.starter_code is not None:
            starter = self.check_code(file, "starterCode", problem.starter_code, entry, kind)
        if problem.viz is not None:
            if problem.solution is None:
                self.error(file, "viz", "viz needs a solution: its events mark solution.code")
            else:
                code = problem.solution.code
                self.check_viz(file, "viz", problem.viz, "solution.code", code, solution)

        self.check_tests(file, problem)
        parsed = {"solution.code": solution, "starterCode": starter}
        self.check_test_kind(file, problem, parsed)
        self.check_io(file, problem, parsed)
        self.check_checker(file, problem)
        self.check_related(file, problem)
        if len(problem.summary) > SUMMARY_WARN_CHARS:  # rule 10
            self.warn(
                file,
                "summary",
                f"{len(problem.summary)} characters; keep it under {SUMMARY_WARN_CHARS}",
            )

    def check_approaches(self, file: str, problem: Problem) -> None:
        optimal_count = sum(approach.id == OPTIMAL for approach in problem.approaches)
        if optimal_count != 1:  # rule 5
            self.error(
                file,
                "approaches",
                f'exactly one approach must have id "optimal" (found {optimal_count})',
            )
        seen: set[str] = set()
        for i, approach in enumerate(problem.approaches):
            at = f"approaches[{i}]"
            if approach.id in seen and approach.id != OPTIMAL:
                self.error(file, f"{at}.id", f"duplicate approach id {approach.id!r}")
            seen.add(approach.id)
            if approach.pattern_id != BRUTE_FORCE:
                self.ref(
                    self.pattern_ids,
                    approach.pattern_id,
                    'pattern id (or "brute_force")',
                    file,
                    f"{at}.patternId",
                )
            self.unique(file, f"{at}.structures", approach.structures, "structure id")
            for j, structure_id in enumerate(approach.structures):
                self.ref(
                    self.structure_ids, structure_id, "structure id", file, f"{at}.structures[{j}]"
                )
            if approach.id == OPTIMAL and approach.accepted_as is not None:
                self.error(file, f"{at}.acceptedAs", "the optimal approach cannot be suboptimal")
        optimal = problem.optimal
        if optimal is not None and optimal.pattern_id != problem.pattern_id:
            self.warn(
                file,
                "patternId",
                f"differs from the optimal approach's patternId {optimal.pattern_id!r}",
            )

    def check_signals(self, file: str, problem: Problem) -> None:
        texts = [problem.summary, *problem.constraints]
        for i, signal in enumerate(problem.signals):
            path = f"signals[{i}].phrase"
            if signal.phrase != signal.phrase.strip():
                self.error(file, path, f"{signal.phrase!r} starts or ends with a space")
            elif not any(phrase_in_text(signal.phrase, text) for text in texts):  # rule 4
                self.error(
                    file,
                    path,
                    f"{signal.phrase!r} does not appear word for word in the summary or "
                    "constraints",
                )
            self.check_points_to(file, f"signals[{i}].pointsTo", signal.points_to)

    def check_points_to(self, file: str, path: str, value: str) -> None:
        if value.startswith(TOOLKIT_PREFIX):
            self.ref(self.toolkit_ids, value.removeprefix(TOOLKIT_PREFIX), "toolkit id", file, path)
        elif value.startswith(STRUCTURE_PREFIX):
            structure_id = value.removeprefix(STRUCTURE_PREFIX)
            self.ref(self.structure_ids, structure_id, "structure id", file, path)
        elif self.pattern_ids is not None and value not in self.pattern_ids:
            self.error(
                file, path, f'{value!r} is not a pattern id, "toolkit:<id>" or "structure:<id>"'
            )

    def check_hints(self, file: str, problem: Problem) -> None:
        if problem.hints is None:
            return
        # Rule 6: every pattern has the same five slots (D1), so no per-pattern lookup.
        keys = set(problem.hints.slots)
        if missing := [slot for slot in SLOT_IDS if slot not in keys]:
            self.error(file, "hints.slots", f"missing slot(s): {', '.join(missing)}")
        if extra := sorted(keys - set(SLOT_IDS)):
            self.error(
                file,
                "hints.slots",
                f"unknown slot(s): {', '.join(extra)} (slots are {', '.join(SLOT_IDS)})",
            )

    def check_tests(self, file: str, problem: Problem) -> None:
        if problem.tests is None:
            return
        seen: set[str] = set()
        for i, test in enumerate(problem.tests):
            if test.id in seen:
                self.error(file, f"tests[{i}].id", f"duplicate test id {test.id!r}")
            seen.add(test.id)
        visible = sum(not test.hidden for test in problem.tests)
        hidden = len(problem.tests) - visible
        if visible < MIN_VISIBLE_TESTS or hidden < MIN_HIDDEN_TESTS:  # rule 9
            self.error(
                file,
                "tests",
                f"needs at least {MIN_VISIBLE_TESTS} visible and {MIN_HIDDEN_TESTS} hidden tests "
                f"(found {visible} visible, {hidden} hidden)",
            )

    # ---- typed parameters, design tests and checkers (PARITY_PLAN 4.1-4.3)

    def check_test_kind(
        self, file: str, problem: Problem, parsed: Mapping[str, ParsedCode | None]
    ) -> None:
        """A function problem's tests give `args`; a design problem's give calls in `ops`."""
        tests = problem.tests or []
        if problem.kind == "function":
            for i, test in enumerate(tests):
                if test.ops is not None:
                    self.error(
                        file,
                        f"tests[{i}].ops",
                        '"ops" are for design problems (kind "design"); a function problem\'s '
                        'test gives "args"',
                    )
            return
        entry = problem.entry
        if entry is None:
            return
        methods = {
            path: _class_methods(code.tree, entry)
            for path, code in parsed.items()
            if code is not None
        }
        for i, test in enumerate(tests):
            if test.args is not None:
                self.error(
                    file,
                    f"tests[{i}].args",
                    'a design problem\'s test lists its calls in "ops", not "args"',
                )
            else:
                self.check_calls(file, f"tests[{i}]", test, entry, methods)

    def check_calls(
        self,
        file: str,
        at: str,
        test: TestCase,
        entry: str,
        methods: Mapping[str, set[str] | None],
    ) -> None:
        ops = test.ops or []
        if ops[0][0] != entry:
            self.error(
                file, f"{at}.ops[0]", f"the first call must construct {entry} (found {ops[0][0]!r})"
            )
        for j, call in enumerate(ops):
            name = call[0]
            if j > 0 and name == entry:
                self.error(file, f"{at}.ops[{j}]", f"only the first call constructs {entry}")
            elif j > 0:
                for code_path, names in methods.items():
                    if names is not None and name not in names:
                        self.error(
                            file, f"{at}.ops[{j}]", f"{entry} in {code_path} has no method {name!r}"
                        )
            for k, arg in enumerate(call[1:], start=1):
                if isinstance(arg, dict) and REF_KEY in arg:
                    self.check_ref(file, f"{at}.ops[{j}][{k}]", arg, j)
        expected = test.expected
        if not isinstance(expected, list) or len(expected) != len(ops):
            self.error(
                file,
                f"{at}.expected",
                f"must be a list with one value per call ({len(ops)} calls), null for the "
                "constructor and for calls that return nothing",
            )
        elif expected[0] is not None:
            self.error(file, f"{at}.expected[0]", "the constructor returns nothing: use null")
        if test.compare in UNORDERED_MODES:
            self.error(
                file,
                f"{at}.compare",
                f'"{test.compare}" does not apply to design tests, whose result is one value '
                'per call, in order; use "checker" when several answers are right',
            )

    def check_ref(self, file: str, path: str, arg: dict[str, Any], call: int) -> None:
        """{"$ref": n} passes what an earlier call (1 to call - 1) returned."""
        ref = arg[REF_KEY]
        if set(arg) == {REF_KEY} and _is_int(ref) and 1 <= ref < call:
            return
        if call <= 1:
            message = "no call before this one returns a value"
        else:
            message = f"n must be an earlier call, from 1 to {call - 1}"
        self.error(file, path, f'{{"{REF_KEY}": n}} passes what call n returned: {message}')

    def check_io(
        self, file: str, problem: Problem, parsed: Mapping[str, ParsedCode | None]
    ) -> None:
        io = problem.io
        if io is None:
            return
        if problem.kind == "design":
            self.error(
                file, "io", "io is for function problems; a design problem's calls take JSON values"
            )
            return
        if problem.tests is None:
            self.error(file, "io", "io needs tests: a drill-only problem never runs")
            return
        names = [param.name for param in io.params]
        self.unique(file, "io.params", names, "parameter")
        for code_path, code in parsed.items():
            params = None
            if code is not None and problem.entry is not None:
                params = _entry_params(code.tree, problem.entry)
            if params is not None and params != names:
                self.error(
                    file,
                    "io.params",
                    f"must list the parameters of {problem.entry} in {code_path}, in order: "
                    f"{_names(params)} (found {_names(names)})",
                )
        if io.in_place is not None:
            if io.in_place not in names:
                self.error(
                    file, "io.inPlace", f"{io.in_place!r} is not one of io.params ({_names(names)})"
                )
            if io.returns != "json":
                self.error(
                    file,
                    "io.returns",
                    'leave "returns" out when "inPlace" is set: the parameter is compared after '
                    "the call, not the return value",
                )
        types = {param.type for param in io.params} | {io.returns}
        if all(kind in types for kind in NODE_IO_TYPES):
            self.error(
                file,
                "io",
                "random_list and graph_node each need their own class named Node; a problem can "
                "use only one of them",
            )
        if names:
            for i, test in enumerate(problem.tests):
                if test.args is not None and len(test.args) != len(names):
                    self.error(
                        file,
                        f"tests[{i}].args",
                        f"has {len(test.args)} argument(s); io.params lists {len(names)} "
                        f"({_names(names)})",
                    )

    def check_checker(self, file: str, problem: Problem) -> None:
        uses = [i for i, test in enumerate(problem.tests or ()) if test.compare == "checker"]
        if problem.checker is None:
            for i in uses:
                self.error(
                    file, f"tests[{i}].compare", 'compare "checker" needs the problem\'s "checker"'
                )
            return
        if problem.tests is None:
            self.error(file, "checker", "a checker needs tests: a drill-only problem never runs")
            return
        parsed = compile_code(problem.checker)
        if isinstance(parsed, SyntaxError):
            self.error(file, "checker", f"syntax error on line {parsed.lineno}: {parsed.msg}")
        else:
            check = _top_level(parsed.tree, CHECK_FUNCTION, ast.FunctionDef)
            if check is None:
                self.error(file, "checker", "must define a function check(args, got)")
            elif not _takes_two_args(check):
                self.error(file, "checker", "check must take two arguments: check(args, got)")
        if not uses:
            self.warn(
                file,
                "checker",
                'no test uses it: set "compare": "checker" on the tests it should judge',
            )

    def check_related(self, file: str, problem: Problem) -> None:
        for i, related in enumerate(problem.related):
            path = f"related[{i}].slug"
            other = self.problems_by_slug.get(related.slug)
            if related.slug == problem.slug:
                self.error(file, path, "a problem cannot be related to itself")
            elif related.slug not in self.known_slugs:
                # Problems are written over several milestones (Section 23, M8), so a link to
                # one without a file yet is expected; the warning still catches a typo.
                self.warn(
                    file,
                    path,
                    f"no problem {related.slug!r} yet; the link stays hidden until its file exists",
                )
            elif other is not None and other.drill_only:
                self.error(file, path, f"{related.slug!r} is drill-only and has no Workspace")

    # ---- code and viz (rule 8)

    def check_code(
        self, file: str, path: str, code: str, entry: str | None, kind: str = "function"
    ) -> ParsedCode | None:
        """Syntax, then `class Solution` with the entry method, or for a design problem the
        class named `entry`. Compiles the code, never runs it."""
        parsed = compile_code(code)
        if isinstance(parsed, SyntaxError):
            self.error(file, path, f"syntax error on line {parsed.lineno}: {parsed.msg}")
            return None
        tree = parsed.tree
        if kind == "design":
            if entry is not None and _top_level(tree, entry, ast.ClassDef) is None:
                self.error(file, path, f"must define class {entry}")
            return parsed
        solution = _top_level(tree, "Solution", ast.ClassDef)
        if solution is None:
            self.error(file, path, "must define class Solution")
        elif entry is not None and not any(
            isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef) and n.name == entry
            for n in solution.body
        ):
            self.error(file, path, f"class Solution has no method {entry!r}")
        return parsed

    def check_viz(
        self,
        file: str,
        path: str,
        viz: VizConfig,
        code_path: str,
        code: str,
        parsed: ParsedCode | None,
    ) -> None:
        markers = self.check_markers(file, code_path, code, parsed)
        event_ids: set[str] = set()
        for i, event in enumerate(viz.events):
            if event.id in event_ids:
                self.error(file, f"{path}.events[{i}].id", f"duplicate event id {event.id!r}")
            event_ids.add(event.id)
            if event.at not in markers:
                self.error(file, f"{path}.events[{i}].at", f"no '# viz:{event.at}' marker in code")
        if len(viz.predict) > MAX_PREDICT:
            self.error(
                file,
                f"{path}.predict",
                f"at most {MAX_PREDICT} predict points per walkthrough (found {len(viz.predict)})",
            )
        for i, predict in enumerate(viz.predict):
            if predict.at_event not in event_ids:
                self.error(
                    file, f"{path}.predict[{i}].atEvent", f"unknown event id {predict.at_event!r}"
                )
        if parsed is not None:
            names = _code_names(parsed.tree)
            for var_path, name in _viz_variables(viz, path):
                if name not in names:
                    self.error(file, var_path, f"variable {name!r} does not appear in the code")
            self.check_expressions(file, path, viz, _local_names(parsed.tree))

    def check_markers(
        self, file: str, path: str, code: str, parsed: ParsedCode | None
    ) -> dict[str, list[int]]:
        """The markers the tracer sees; flags the ones it would never fire on."""
        markers = marker_lines(code)
        for lineno, line in enumerate(code.splitlines(), start=1):
            if len(found := MARKER_RE.findall(line)) > 1:
                self.error(
                    file,
                    path,
                    f"line {lineno} has {len(found)} viz markers; the tracer only sees the first "
                    f"('# viz:{found[0]}')",
                )
        if parsed is not None:
            traced = traced_lines(parsed.compiled)
            for name, lines in markers.items():
                for lineno in lines:
                    if lineno not in traced:
                        self.error(
                            file,
                            path,
                            f"'# viz:{name}' on line {lineno} never fires: the tracer only stops "
                            "on lines that run code inside a function (not a comment-only line, "
                            "`else:` or a `def` line)",
                        )
        return markers

    def check_expressions(self, file: str, path: str, viz: VizConfig, names: set[str]) -> None:
        """Narration and conditions parse and read only the code's variables. The Section 8.2
        tracer swallows their errors, so a typo would silently drop narration, skip an event
        or grade a predict point wrong."""
        conditions = [(f"{path}.events[{i}].when", e.when) for i, e in enumerate(viz.events)]
        conditions += [
            (f"{path}.predict[{i}].answerWhen", p.answer_when) for i, p in enumerate(viz.predict)
        ]
        for at, condition in conditions:
            if condition is not None:
                self.check_expression(file, at, condition, names, CONDITION_BUILTINS)
        for i, event in enumerate(viz.events):
            if event.say is not None:
                # The tracer evaluates a `say` template as the f-string "f" + repr(say).
                source = "f" + repr(event.say)
                self.check_expression(file, f"{path}.events[{i}].say", source, names, SAY_BUILTINS)

    def check_expression(
        self, file: str, path: str, source: str, names: set[str], builtins: frozenset[str]
    ) -> None:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                expression = ast.parse(source, mode="eval")
            except SyntaxError as exc:
                self.error(file, path, f"does not parse: {exc.msg}")
                return
        for name in sorted(_free_names(expression) - names - builtins):
            self.error(
                file,
                path,
                f"{name!r} is not a variable in the code (the only builtins here are "
                f"{' and '.join(sorted(builtins))})",
            )

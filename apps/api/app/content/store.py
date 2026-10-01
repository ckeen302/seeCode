"""Content store: loads and validates `content/` once at startup, indexes it, and builds
the public views the content endpoints return (Sections 10 and 16.2).

The API refuses to start when content has errors (rules 1-6 and 8-10 of Section 10.7;
rule 7 runs in scripts/validate_content.py, D8).
"""

import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath

from app.content.models import Pattern, Problem, Roadmap, Structure, ToolkitCard
from app.content.validation import ContentSet, Issue, read_content_files, validate_files
from app.learning.mastery import (
    SIGNED_OUT_STATE,
    PatternProgress,
    ProblemStatus,
    is_solved,
    pattern_progress,
    problem_status,
)
from app.schemas.content import (
    ExampleView,
    PatternProblemView,
    PatternProgressView,
    PatternSummary,
    PatternView,
    ProblemListItem,
    ProblemPublic,
    RoadmapNodeView,
    RoadmapView,
    TargetsView,
    TestCaseView,
    UnlockRuleView,
)


def content_version(files: Mapping[str, bytes]) -> str:
    """First 12 hex chars of SHA-256 over each file's relative path and bytes."""
    digest = hashlib.sha256()
    for name in sorted(files, key=lambda name: PurePosixPath(name).parts):
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(files[name])
        digest.update(b"\0")
    return digest.hexdigest()[:12]


def compute_content_version(content_dir: Path) -> str:
    """Short, stable hash of every JSON file under `content/` (names and bytes)."""
    return content_version(read_content_files(content_dir))


class ContentError(RuntimeError):
    """The content folder has errors, so the API must not start."""

    def __init__(self, content_dir: Path, errors: Sequence[Issue]) -> None:
        self.errors = list(errors)
        listing = "\n".join(f"  {issue}" for issue in self.errors)
        super().__init__(
            f"Content in {content_dir} has {len(self.errors)} error(s); the API will not "
            f"start until they are fixed:\n{listing}"
        )


@dataclass(frozen=True, slots=True)
class UserProblem:
    """The parts of a `problem_progress` row the content views need."""

    status: str
    best_rung: int | None = None
    last_attempt_at: datetime | None = None


UserProgress = Mapping[str, UserProblem]  # by problem slug; views take None when signed out


def load_content(content_dir: Path) -> "ContentStore":
    """Read, validate and index `content_dir`; raises ContentError on any error."""
    if not content_dir.is_dir():
        raise ContentError(
            content_dir, [Issue("error", str(content_dir), "", "content folder not found")]
        )
    files = read_content_files(content_dir)
    result = validate_files(files)
    if result.errors:
        raise ContentError(content_dir, result.errors)
    return ContentStore(result.content, content_version(files), result.warnings)


class ContentStore:
    """Validated content with its indexes. Read-only after construction."""

    def __init__(self, content: ContentSet, version: str, warnings: Sequence[Issue] = ()) -> None:
        if (
            content.patterns is None
            or content.roadmap is None
            or content.structures is None
            or content.toolkit is None
        ):
            raise ValueError("ContentStore needs validated content")
        self.version = version
        self.warnings = list(warnings)
        self.roadmap: Roadmap = content.roadmap

        by_id = {pattern.id: pattern for pattern in content.patterns}
        self.patterns: list[Pattern] = [by_id[node.id] for node in self.roadmap.patterns]
        self.patterns_by_id: dict[str, Pattern] = {p.id: p for p in self.patterns}
        self.pattern_families: dict[str, str] = {p.id: p.family for p in self.patterns}
        self.structures: list[Structure] = list(content.structures)
        self.structures_by_id: dict[str, Structure] = {s.id: s for s in self.structures}
        self.structure_labels: dict[str, str] = {s.id: s.label for s in self.structures}
        self.toolkit: list[ToolkitCard] = list(content.toolkit)
        self.toolkit_by_id: dict[str, ToolkitCard] = {t.id: t for t in self.toolkit}

        ordered = sorted(content.problems.values(), key=lambda p: (p.order, p.slug))
        # Every problem, drill-only ones too.
        self.problems_by_slug: dict[str, Problem] = {p.slug: p for p in ordered}
        # Workspace problems (not drill-only), by `order`.
        self.problems: list[Problem] = [p for p in ordered if not p.drill_only]
        self.problems_by_pattern: dict[str, list[Problem]] = {
            pattern_id: [p for p in self.problems if p.pattern_id == pattern_id]
            for pattern_id in self.patterns_by_id
        }
        # Workspace and drill-only problems, for drills (M5).
        self.all_problems_by_pattern: dict[str, list[Problem]] = {
            pattern_id: [p for p in ordered if p.pattern_id == pattern_id]
            for pattern_id in self.patterns_by_id
        }

        self._prereqs = {node.id: node.prereqs for node in self.roadmap.patterns}
        self._slugs_by_pattern = {
            pattern_id: [p.slug for p in problems]
            for pattern_id, problems in self.problems_by_pattern.items()
        }
        self._problem_public = {p.slug: _problem_public(p, version) for p in self.problems}
        self._pattern_summaries = [
            PatternSummary(
                id=p.id,
                family=p.family,
                name=p.name,
                idea=p.idea,
                problem_count=len(self.problems_by_pattern[p.id]),
            )
            for p in self.patterns
        ]

    # ---- lookups

    def workspace_problem(self, slug: str) -> Problem | None:
        """A problem that has a Workspace page (None for unknown or drill-only slugs)."""
        problem = self.problems_by_slug.get(slug)
        return None if problem is None or problem.drill_only else problem

    def toolkit_for_pattern(self, pattern: Pattern) -> list[ToolkitCard]:
        """Cards the pattern lists plus cards tagged with the pattern, in toolkit order."""
        listed = set(pattern.toolkit)
        return [card for card in self.toolkit if card.id in listed or pattern.id in card.patterns]

    def pattern_progress(self, progress: UserProgress) -> dict[str, PatternProgress]:
        statuses = {slug: row.status for slug, row in progress.items()}
        return pattern_progress(
            self._slugs_by_pattern,
            self._prereqs,
            statuses,
            self.roadmap.unlock_rule.solved_in_prereq,
        )

    # ---- public views

    def problem_public(self, slug: str) -> ProblemPublic | None:
        return self._problem_public.get(slug)

    def pattern_summaries(self) -> list[PatternSummary]:
        return list(self._pattern_summaries)

    def problem_list(
        self, progress: UserProgress | None, show_patterns: bool = False
    ) -> list[ProblemListItem]:
        items = []
        for problem in self.problems:
            row = progress.get(problem.slug) if progress is not None else None
            status = _status(row, progress)
            items.append(
                ProblemListItem(
                    slug=problem.slug,
                    title=problem.title,
                    difficulty=problem.difficulty,
                    order=problem.order,
                    pattern_id=problem.pattern_id if show_patterns or is_solved(status) else None,
                    status=status,
                    best_rung=row.best_rung if row else None,
                    last_attempt_at=row.last_attempt_at if row else None,
                )
            )
        return items

    def roadmap_view(self, progress: UserProgress | None) -> RoadmapView:
        states = self.pattern_progress(progress) if progress is not None else None
        nodes = []
        for node in self.roadmap.patterns:
            pattern = self.patterns_by_id[node.id]
            state = states[node.id] if states is not None else None
            nodes.append(
                RoadmapNodeView(
                    id=node.id,
                    name=pattern.name,
                    family=pattern.family,
                    x=node.x,
                    y=node.y,
                    prereqs=list(node.prereqs),
                    problem_count=len(self.problems_by_pattern[node.id]),
                    state=state.state if state is not None else SIGNED_OUT_STATE,
                    progress=_progress_view(state),
                )
            )
        return RoadmapView(
            patterns=nodes,
            unlock_rule=UnlockRuleView(solved_in_prereq=self.roadmap.unlock_rule.solved_in_prereq),
        )

    def pattern_view(self, pattern_id: str, progress: UserProgress | None) -> PatternView | None:
        pattern = self.patterns_by_id.get(pattern_id)
        if pattern is None:
            return None
        state = self.pattern_progress(progress)[pattern_id] if progress is not None else None
        problems = []
        for problem in self.problems_by_pattern[pattern_id]:
            row = progress.get(problem.slug) if progress is not None else None
            status = _status(row, progress)
            optimal = problem.optimal
            problems.append(
                PatternProblemView(
                    slug=problem.slug,
                    title=problem.title,
                    difficulty=problem.difficulty,
                    order=problem.order,
                    status=status,
                    twist=optimal.twist if optimal is not None and is_solved(status) else None,
                )
            )
        return PatternView(
            id=pattern.id,
            family=pattern.family,
            name=pattern.name,
            idea=pattern.idea,
            explanation=pattern.explanation,
            signals=pattern.signals,
            template=pattern.template,
            slots=pattern.slots,
            variations=pattern.variations,
            mistakes=pattern.mistakes,
            demo=pattern.demo,
            toolkit=pattern.toolkit,
            toolkit_cards=self.toolkit_for_pattern(pattern),
            problem_count=len(problems),
            state=state.state if state is not None else SIGNED_OUT_STATE,
            progress=_progress_view(state),
            problems=problems,
        )


def _status(row: UserProblem | None, progress: UserProgress | None) -> ProblemStatus | None:
    if progress is None:
        return None
    return problem_status(row.status if row is not None else None)


def _progress_view(state: PatternProgress | None) -> PatternProgressView | None:
    if state is None:
        return None
    return PatternProgressView(solved=state.solved, mastered=state.mastered)


def _problem_public(problem: Problem, version: str) -> ProblemPublic:
    # Built from a whitelist of fields, so answer fields cannot leak by accident.
    if problem.entry is None or problem.starter_code is None or problem.tests is None:
        raise ValueError(f"{problem.slug} is drill-only and has no Workspace view")
    return ProblemPublic(
        slug=problem.slug,
        title=problem.title,
        leetcode_url=problem.leetcode_url,
        difficulty=problem.difficulty,
        order=problem.order,
        summary=problem.summary,
        examples=[
            ExampleView(input=e.input, output=e.output, explanation=e.explanation)
            for e in problem.examples
        ],
        constraints=list(problem.constraints),
        targets=TargetsView(time=problem.targets.time, space=problem.targets.space),
        entry=problem.entry,
        starter_code=problem.starter_code,
        tests=[
            TestCaseView(
                id=t.id, args=t.args, expected=t.expected, hidden=t.hidden, compare=t.compare
            )
            for t in problem.tests
        ],
        content_version=version,
    )

"""SeeCode test harness (Section 9.2).

The single source for running tests: the browser runner loads it into Pyodide (M2) and
scripts/validate_content.py runs it in CPython. Standard library only; it runs on CPython
3.12 and in Pyodide.

    run_tests(code, entry, tests_json, mode="exact", spec_json=None) -> JSON string

returns one TestResult per test, in order:
    {"id", "status": "pass" | "fail" | "error", "got"?, "gotRepr"?, "stdout"?, "error"?, "ms"?}
("timeout" is set by the caller, which owns the clock and kills the run.) Whatever the
code does or returns, each test gets its own result; only KeyboardInterrupt, which Pyodide
uses to stop a run, gets through. `got` is plain JSON (nodes are converted back to lists);
a value JSON cannot hold (nan, inf, a generator, an object) is sent as its Python repr with
`"gotRepr": true`, so the UI can tell it from a returned string. A result with more than
MAX_RESULT_ITEMS items fails at once, with a short repr preview and an `error` that says
why. `stdout` holds what the code printed to stdout and stderr, in order. `mode` is the
compare mode of tests that set none.

`spec_json` describes the problem: the `kind`, `io` and `checker` fields of its
ProblemPublic, as one JSON object. Leave it out (None, "" or "null") for a function
problem with plain JSON arguments; a missing or null key means its default:

    {"kind": "function" | "design",
     "io": {"params": [{"name": "head", "type": "list_node"}, ...],
            "returns": "list_node", "inPlace": null} | null,
     "checker": "def check(args, got):\\n    ..." | null}

kind "function" (the default): a test is {"id", "args", "expected"?, "compare"?} and runs
`Solution().<entry>(*args)` with a new Solution and fresh arguments for every test.

kind "design": a test is {"id", "ops", "expected"?, "compare"?}. `ops` is a list of calls
`[name, *args]`: the first constructs the class named `entry` (`["MinStack"]`), the others
call its methods in order (`["push", 3]`). `got` is the list of return values, one per
call, null for the constructor; `expected` has the same shape. An argument written
`{"$ref": i}` passes the value call i (0-based) returned, as is (decode what encode made).

io (function problems only) converts each argument before the call and the result after
it. `params` lists the entry method's parameters in order, each with a type:
    json         the JSON value as is (the default)
    list_node    [1, 2, 3]  <->  ListNode(1) -> ListNode(2) -> ListNode(3); [] is None
    tree_node    LeetCode's level order with null for a missing child: [1, null, 2] is
                 TreeNode(1) with right child TreeNode(2); [] is None; trailing nulls are
                 left out of results
    random_list  [[val, randomIndex | null], ...]  <->  Node(val, next, random)
    graph_node   adjacency list of node values 1..n: [[2], [1]] is Node(1) and Node(2),
                 neighbors of each other; the method gets node 1; [] is None
    list_node[], tree_node[]   a list of those
`returns` is the type of the return value; `inPlace` names a parameter whose value after
the call is compared instead (the return value is ignored). A random_list or graph_node
result must be a deep copy: one that reuses an input node fails, with an `error` that says
so. A result with a cycle, a shared node or more than MAX_NODES nodes is an error, never a
hang.

Compare modes: "exact" (the default), "unordered", "unordered_nested", "float", and
"checker", which calls the spec's `check(args, got)` (args: the test's JSON args, or a
design test's ops; got: the converted result) and passes when it returns True. A checker
that raises or returns a non-bool fails the test, with an `error` that says why.

The prelude is executed in the namespace before the user's code is compiled as
"<solution>", so a traceback's `File "<solution>", line N` is editor line N. It defines
ListNode and TreeNode as LeetCode does (with readable reprs), and a problem whose io uses
random_list or graph_node also gets LeetCode's Node class for it.

For the tracer: parse_spec, new_namespace(spec), convert_args and resolve_refs set up a
run the same way.

apps/web/public/ is served as is, so load this file without writing bytecode next to it:
exec its source into a new module (as scripts/validate_content.py does) or use python -B.
"""

import contextlib
import copy
import io
import json
import linecache
import time
import traceback
from collections import deque
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

SOLUTION_FILE = "<solution>"
PRELUDE_FILE = "<prelude>"
CHECKER_FILE = "<checker>"
# Names every run can use without importing them. ListNode and TreeNode are LeetCode's.
PRELUDE = (
    "from typing import *\n"
    "from collections import *\n"
    "import heapq, bisect, math, itertools, functools\n"
    "\n"
    "\n"
    "class ListNode:\n"
    "    def __init__(self, val=0, next=None):\n"
    "        self.val = val\n"
    "        self.next = next\n"
    "\n"
    "\n"
    "class TreeNode:\n"
    "    def __init__(self, val=0, left=None, right=None):\n"
    "        self.val = val\n"
    "        self.left = left\n"
    "        self.right = right\n"
)
# LeetCode's two classes named Node; a problem gets the one its io types need.
RANDOM_NODE = (
    "class Node:\n"
    "    def __init__(self, x: int, next: 'Node' = None, random: 'Node' = None):\n"
    "        self.val = int(x)\n"
    "        self.next = next\n"
    "        self.random = random\n"
)
GRAPH_NODE = (
    "class Node:\n"
    "    def __init__(self, val = 0, neighbors = None):\n"
    "        self.val = val\n"
    "        self.neighbors = neighbors if neighbors is not None else []\n"
)
NODE_CLASSES = {"random_list": RANDOM_NODE, "graph_node": GRAPH_NODE}
# The prelude is not prepended to the user's code, so line numbers need no offset.
PRELUDE_LINES = 0
KINDS = ("function", "design")
COMPARE_MODES = ("exact", "unordered", "unordered_nested", "float", "checker")
IO_TYPES = (
    "json",
    "list_node",
    "list_node[]",
    "tree_node",
    "tree_node[]",
    "random_list",
    "graph_node",
)
REF_KEY = "$ref"
FLOAT_TOLERANCE = 1e-6
MAX_STDOUT = 4000
MAX_TRACEBACK_FRAMES = 5
MAX_NODES = 100_000  # a bigger result is an error: it is almost surely a bug
# Items (list elements, dict values; a string counts once per 100 characters) a result may
# hold. Reading a bigger one takes seconds in Pyodide, and no test expects one.
MAX_RESULT_ITEMS = 100_000
MAX_PREVIEW_ITEMS = 10
MAX_REPR_NODES = 20
MAX_SHORT = 60


class SpecError(ValueError):
    """The spec, or a design test's calls, cannot be run."""


class ConversionError(ValueError):
    """A value does not fit its io type."""


@dataclass(frozen=True)
class Io:
    params: tuple[tuple[str, str], ...] = ()  # (name, type), in the method's order
    returns: str = "json"
    in_place: int | None = None  # index of the parameter compared after the call

    def node_class(self) -> str | None:
        """The io type ("random_list" or "graph_node") whose Node class the run needs."""
        types = {kind for _, kind in self.params} | {self.returns}
        return next((kind for kind in NODE_CLASSES if kind in types), None)


@dataclass(frozen=True)
class Spec:
    kind: str = "function"
    io: Io | None = None
    checker: str | None = None


def parse_spec(spec: str | Mapping[str, Any] | Spec | None = None) -> Spec:
    """The Spec described by `spec_json` (a JSON string or an already parsed object)."""
    if isinstance(spec, Spec):
        return spec
    data: Any = spec
    if isinstance(spec, str):
        if not spec.strip():
            return Spec()
        try:
            data = json.loads(spec)
        except ValueError as exc:
            raise SpecError(f"not valid JSON: {exc}") from None
    if data is None:
        return Spec()
    if not isinstance(data, Mapping):
        raise SpecError("expected a JSON object")
    kind = data.get("kind") or "function"
    if kind not in KINDS:
        raise SpecError(f"unknown kind {kind!r} (expected 'function' or 'design')")
    checker = data.get("checker")
    if checker is not None and not isinstance(checker, str):
        raise SpecError("checker must be Python code, as a string")
    io_spec = None if data.get("io") is None else _parse_io(data["io"])
    if io_spec is not None and kind == "design":
        raise SpecError("io applies to function problems only")
    return Spec(kind, io_spec, checker or None)


def _parse_io(data: Any) -> Io:
    if not isinstance(data, Mapping):
        raise SpecError("io must be an object")
    raw_params = data.get("params")
    if raw_params is None:
        raw_params = []
    if not isinstance(raw_params, list):
        raise SpecError("io.params must be a list")
    params: list[tuple[str, str]] = []
    for i, param in enumerate(raw_params):
        if not isinstance(param, Mapping) or not isinstance(param.get("name"), str):
            raise SpecError(f'io.params[{i}] must be {{"name": ..., "type": ...}}')
        params.append((param["name"], _io_type(param.get("type"), f"io.params[{i}].type")))
    returns = _io_type(data.get("returns"), "io.returns")
    in_place = data.get("inPlace")
    names = [name for name, _ in params]
    if in_place is not None and in_place not in names:
        raise SpecError(f"io.inPlace {in_place!r} is not one of io.params")
    io_spec = Io(tuple(params), returns, None if in_place is None else names.index(in_place))
    types = {kind for _, kind in params} | {returns}
    if all(kind in types for kind in NODE_CLASSES):
        raise SpecError("random_list and graph_node both need a class named Node; use one")
    return io_spec


def _io_type(value: Any, where: str) -> str:
    kind = value or "json"
    if kind not in IO_TYPES:
        raise SpecError(f"{where}: unknown type {kind!r} (expected one of {', '.join(IO_TYPES)})")
    return str(kind)


# ---------------------------------------------------------------- the namespace


def new_namespace(spec: Spec | None = None) -> dict[str, Any]:
    """A fresh namespace with the prelude names, plus the Node class the spec's io needs.

    Every run gets new classes, so a change to one (`ListNode.__lt__ = ...`, a common heap
    trick) cannot leak into the next run.
    """
    # __name__ is not "__main__", so an `if __name__ == "__main__":` block does not run.
    namespace: dict[str, Any] = {"__name__": "solution"}
    exec(compile(PRELUDE, PRELUDE_FILE, "exec"), namespace)
    namespace["ListNode"].__repr__ = _list_node_repr
    namespace["TreeNode"].__repr__ = _tree_node_repr
    node = spec.io.node_class() if spec is not None and spec.io is not None else None
    if node is not None:
        exec(compile(NODE_CLASSES[node], PRELUDE_FILE, "exec"), namespace)
        is_random = node == "random_list"
        namespace["Node"].__repr__ = _random_node_repr if is_random else _graph_node_repr
    return namespace


def _node_classes(namespace: Mapping[str, Any]) -> dict[str, type]:
    """The node classes to build arguments with, taken before the user's code runs (it may
    define its own ListNode; results are read by attribute, so either class works)."""
    names = ("ListNode", "TreeNode", "Node")
    return {name: namespace[name] for name in names if isinstance(namespace.get(name), type)}


def _list_node_repr(self: Any) -> str:
    parts: list[str] = []
    seen: set[int] = set()
    node = self
    while node is not None:
        if id(node) in seen:
            parts.append("(cycle)")
            break
        if len(parts) == MAX_REPR_NODES:
            parts.append("...")
            break
        seen.add(id(node))
        parts.append(_safe_repr(getattr(node, "val", None)))
        node = getattr(node, "next", None)
    return f"ListNode({' -> '.join(parts)})"


def _tree_node_repr(self: Any) -> str:
    """The subtree in level order, as the tests write it (None for a missing child)."""
    parts: list[str] = []
    seen: set[int] = set()
    queue: deque[Any] = deque([self])
    while queue:
        node = queue.popleft()
        if node is None:
            parts.append("None")
            continue
        if id(node) in seen:
            parts.append("(cycle)")
            break
        if len(seen) == MAX_REPR_NODES:
            parts.append("...")
            break
        seen.add(id(node))
        parts.append(_safe_repr(getattr(node, "val", None)))
        queue.extend((getattr(node, "left", None), getattr(node, "right", None)))
    while parts and parts[-1] == "None":
        parts.pop()
    return f"TreeNode([{', '.join(parts)}])"


def _val_of(node: Any) -> str:
    return "None" if node is None else _safe_repr(getattr(node, "val", None))


def _random_node_repr(self: Any) -> str:
    val, nxt, random = (getattr(self, key, None) for key in ("val", "next", "random"))
    return f"Node({_safe_repr(val)}, next={_val_of(nxt)}, random={_val_of(random)})"


def _graph_node_repr(self: Any) -> str:
    neighbors = getattr(self, "neighbors", None)
    if isinstance(neighbors, list | tuple):
        shown = [_val_of(node) for node in neighbors[:MAX_REPR_NODES]]
        more = ", ..." if len(neighbors) > MAX_REPR_NODES else ""
        listed = f"[{', '.join(shown)}{more}]"
    else:
        listed = _safe_repr(neighbors)
    return f"Node({_safe_repr(getattr(self, 'val', None))}, neighbors={listed})"


# ---------------------------------------------------------------- io: JSON -> Python


@dataclass
class _Build:
    classes: dict[str, type]
    # Nodes built for random_list and graph_node arguments: a result must not reuse them.
    inputs: set[int] = field(default_factory=set)
    reused: str | None = None  # "list" or "graph" when a result reuses an input node


def convert_args(args: list[Any], spec: Spec, namespace: Mapping[str, Any]) -> list[Any]:
    """The entry method's arguments built from their JSON values, as run_tests builds them.

    Call it before the user's code runs in `namespace`, which may shadow ListNode.
    Raises ConversionError when a value does not fit its type.
    """
    converted: list[Any] = _convert_args(args, spec.io, _Build(_node_classes(namespace)))
    return converted


def _convert_args(args: Any, io_spec: Io | None, build: _Build) -> Any:
    if io_spec is None or not io_spec.params:
        return args
    names = ", ".join(name for name, _ in io_spec.params)
    if not isinstance(args, list) or len(args) != len(io_spec.params):
        found = f"{len(args)}" if isinstance(args, list) else _short(args)
        raise ConversionError(f"expected {len(io_spec.params)} argument(s) ({names}), got {found}")
    converted = []
    for value, (name, kind) in zip(args, io_spec.params, strict=True):
        try:
            converted.append(_to_python(value, kind, build))
        except Exception as exc:
            raise ConversionError(f"{name} ({kind}): {_reason(exc)}") from None
    return converted


def _to_python(value: Any, kind: str, build: _Build) -> Any:
    if kind == "json":
        return value
    if kind.endswith("[]"):
        if not isinstance(value, list):
            raise ConversionError(f"expected a list, got {_short(value)}")
        return [_to_python(item, kind[:-2], build) for item in value]
    if kind == "list_node":
        return _build_list(value, build.classes["ListNode"])
    if kind == "tree_node":
        return _build_tree(value, build.classes["TreeNode"])
    if kind == "random_list":
        return _build_random_list(value, build.classes["Node"], build.inputs)
    if kind == "graph_node":
        return _build_graph(value, build.classes["Node"], build.inputs)
    raise ConversionError(f"unknown io type {kind!r}")


def _build_list(values: Any, list_node: type) -> Any:
    if not isinstance(values, list):
        raise ConversionError(f"expected a list of values, got {_short(values)}")
    head = None
    for value in reversed(values):
        node = list_node(value)
        node.next = head
        head = node
    return head


def _build_tree(values: Any, tree_node: type) -> Any:
    """LeetCode's level order: each node's two children in turn, null for a missing one."""
    if not isinstance(values, list):
        raise ConversionError(f"expected a level-order list, got {_short(values)}")
    if not values or values[0] is None:
        if any(value is not None for value in values):
            raise ConversionError("the root is null, so no other value has a parent")
        return None
    root = tree_node(values[0])
    parents: deque[Any] = deque([root])
    i = 1
    while i < len(values):
        if not parents:
            stray = next((j for j in range(i, len(values)) if values[j] is not None), None)
            if stray is None:
                break  # trailing nulls
            raise ConversionError(
                f"{_short(values[stray])} at index {stray} has no parent: the nodes before it "
                "have no free child slot"
            )
        parent = parents.popleft()
        for side in ("left", "right"):
            if i < len(values) and values[i] is not None:
                child = tree_node(values[i])
                setattr(parent, side, child)
                parents.append(child)
            i += 1
    return root


def _build_random_list(pairs: Any, node_class: type, inputs: set[int]) -> Any:
    if not isinstance(pairs, list):
        raise ConversionError(f"expected a list of [val, randomIndex] pairs, got {_short(pairs)}")
    nodes = []
    for i, pair in enumerate(pairs):
        if not isinstance(pair, list) or len(pair) != 2:
            raise ConversionError(f"item {i} should be [val, randomIndex], got {_short(pair)}")
        nodes.append(node_class(pair[0]))
    for i, node in enumerate(nodes):
        node.next = nodes[i + 1] if i + 1 < len(nodes) else None
        index = pairs[i][1]
        if index is not None and not _is_index(index, len(nodes)):
            raise ConversionError(
                f"item {i}: randomIndex {_short(index)} is not null or an index from 0 to "
                f"{len(nodes) - 1}"
            )
        node.random = None if index is None else nodes[index]
    inputs.update(map(id, nodes))
    return nodes[0] if nodes else None


def _build_graph(adjacency: Any, node_class: type, inputs: set[int]) -> Any:
    """Node values are 1..n and adjacency[i] lists the neighbors of node i + 1."""
    if not isinstance(adjacency, list) or not all(isinstance(row, list) for row in adjacency):
        raise ConversionError(
            f"expected an adjacency list (a list of lists), got {_short(adjacency)}"
        )
    nodes = [node_class(i + 1) for i in range(len(adjacency))]
    for i, row in enumerate(adjacency):
        for value in row:
            if not _is_index(value - 1 if _is_int(value) else None, len(nodes)):
                raise ConversionError(
                    f"node {i + 1} lists neighbor {_short(value)}; node values go from 1 to "
                    f"{len(nodes)}"
                )
            nodes[i].neighbors.append(nodes[value - 1])
    if nodes:
        reached = {id(node) for node in _graph_nodes(nodes[0])}
        unreached = [i + 1 for i, node in enumerate(nodes) if id(node) not in reached]
        if unreached:
            raise ConversionError(
                f"node(s) {', '.join(map(str, unreached))} cannot be reached from node 1, "
                "and the method only gets node 1"
            )
    inputs.update(map(id, nodes))
    return nodes[0] if nodes else None


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_index(value: Any, length: int) -> bool:
    return _is_int(value) and 0 <= value < length


# ---------------------------------------------------------------- io: Python -> JSON


def _to_json(value: Any, kind: str, build: _Build) -> Any:
    if kind == "json":
        return value
    if kind.endswith("[]"):
        if not isinstance(value, list | tuple):
            raise ConversionError(f"expected a list, got {type(value).__name__}")
        return [_to_json(item, kind[:-2], build) for item in value]
    if kind == "list_node":
        return _list_values(value)
    if kind == "tree_node":
        return _tree_values(value)
    if kind == "random_list":
        return _random_list_values(value, build)
    if kind == "graph_node":
        return _graph_values(value, build)
    raise ConversionError(f"unknown io type {kind!r}")


def _require(node: Any, attributes: tuple[str, ...], expected: str) -> None:
    if not all(hasattr(node, attribute) for attribute in attributes):
        raise ConversionError(f"expected a {expected} or None, got {type(node).__name__}")


def _too_many(what: str) -> ConversionError:
    return ConversionError(f"the {what} has more than {MAX_NODES:,} nodes")


def _list_values(head: Any) -> list[Any]:
    values: list[Any] = []
    positions: dict[int, int] = {}  # node id -> 1-based position
    node = head
    while node is not None:
        _require(node, ("val", "next"), "ListNode")
        if id(node) in positions:
            raise ConversionError(
                f"the list has a cycle: node {len(values)} links back to node {positions[id(node)]}"
            )
        if len(values) == MAX_NODES:
            raise _too_many("list")
        values.append(node.val)
        positions[id(node)] = len(values)
        node = node.next
    return values


def _tree_values(root: Any) -> list[Any]:
    """LeetCode's level order, without trailing nulls."""
    values: list[Any] = []
    seen: set[int] = set()
    queue: deque[Any] = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            values.append(None)
            continue
        _require(node, ("val", "left", "right"), "TreeNode")
        if id(node) in seen:
            raise ConversionError(
                f"the node with val {_short(node.val)} is reached twice: the tree has a cycle "
                "or a shared node"
            )
        if len(seen) == MAX_NODES:
            raise _too_many("tree")
        seen.add(id(node))
        values.append(node.val)
        queue.extend((node.left, node.right))
    while values and values[-1] is None:
        values.pop()
    return values


def _random_list_values(head: Any, build: _Build) -> list[list[Any]]:
    nodes: list[Any] = []
    positions: dict[int, int] = {}  # node id -> 0-based index
    node = head
    while node is not None:
        _require(node, ("val", "next", "random"), "Node")
        if id(node) in build.inputs:
            build.reused = "list"
        if id(node) in positions:
            raise ConversionError(
                f"the list has a cycle: node {len(nodes)} links back to node "
                f"{positions[id(node)] + 1}"
            )
        if len(nodes) == MAX_NODES:
            raise _too_many("list")
        positions[id(node)] = len(nodes)
        nodes.append(node)
        node = node.next
    pairs = []
    for position, node in enumerate(nodes, start=1):
        target = node.random
        if target is None:
            pairs.append([node.val, None])
        elif id(target) in positions:
            pairs.append([node.val, positions[id(target)]])
        elif id(target) in build.inputs:
            raise ConversionError(
                f"node {position}'s random points into the input list; point it at a node "
                "of the copy"
            )
        else:
            raise ConversionError(f"node {position}'s random points to a node outside the list")
    return pairs


def _graph_nodes(start: Any) -> list[Any]:
    """Every node reachable from `start`, in breadth-first order."""
    _require(start, ("val", "neighbors"), "Node")
    order = [start]
    seen = {id(start)}
    queue: deque[Any] = deque([start])
    while queue:
        node = queue.popleft()
        neighbors = node.neighbors
        if not isinstance(neighbors, list | tuple):
            raise ConversionError(f"neighbors should be a list, got {type(neighbors).__name__}")
        for neighbor in neighbors:
            _require(neighbor, ("val", "neighbors"), "Node")
            if id(neighbor) not in seen:
                if len(order) == MAX_NODES:
                    raise _too_many("graph")
                seen.add(id(neighbor))
                order.append(neighbor)
                queue.append(neighbor)
    return order


def _graph_values(start: Any, build: _Build) -> list[list[Any]]:
    if start is None:
        return []
    nodes = _graph_nodes(start)
    if any(id(node) in build.inputs for node in nodes):
        build.reused = "graph"
    values = [node.val for node in nodes]
    try:
        numbered = sorted(values) == list(range(1, len(nodes) + 1))
    except TypeError:
        numbered = False
    if not numbered:
        shown = ", ".join(_short(value) for value in values[:MAX_REPR_NODES])
        more = ", ..." if len(values) > MAX_REPR_NODES else ""
        raise ConversionError(
            f"node values should be 1 to {len(nodes)}, each once (found {shown}{more}); "
            "was a node copied twice?"
        )
    return [[neighbor.val for neighbor in node.neighbors] for node in sorted(nodes, key=_val)]


def _val(node: Any) -> Any:
    return node.val


# ---------------------------------------------------------------- results


class _Output(io.StringIO):
    """Captured output. The code may call `sys.stdout.close()`; what it printed is kept."""

    def close(self) -> None:
        pass


@contextlib.contextmanager
def _capture(buffer: io.StringIO) -> Iterator[None]:
    """Send stdout and stderr to `buffer`, in the order they are written."""
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        yield


def _normalize(value: Any) -> Any:
    """Make a result comparable with JSON: tuples and deques become lists, sets sorted lists."""
    if isinstance(value, list | tuple | deque):
        return [_normalize(item) for item in value]
    if isinstance(value, set | frozenset):
        return sorted((_normalize(item) for item in value), key=_sort_key)
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in value.items()}
    return value


def _safe_repr(value: Any) -> str:
    try:
        return repr(value)
    except Exception:  # a user-defined __repr__ that raises, or an int too long to print
        return f"<{type(value).__name__}>"


def _short(value: Any) -> str:
    """A value for a message: JSON if it can be, cut to MAX_SHORT characters."""
    try:
        text = json.dumps(value, ensure_ascii=False, allow_nan=False)
    except Exception:
        text = _safe_repr(value)
    return text if len(text) <= MAX_SHORT else text[: MAX_SHORT - 3] + "..."


def _sort_key(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, default=_safe_repr)
    except Exception:
        return _safe_repr(value)


def _close(got: Any, expected: Any) -> bool:
    numbers = (int, float)
    if isinstance(got, numbers) and isinstance(expected, numbers):
        if isinstance(got, bool) or isinstance(expected, bool):
            return got == expected
        return got == expected or abs(got - expected) < FLOAT_TOLERANCE
    if isinstance(got, list) and isinstance(expected, list):
        return len(got) == len(expected) and all(map(_close, got, expected))
    return bool(got == expected)


def _equal(got: Any, expected: Any, mode: str) -> bool:
    """Compare a normalized result with the expected JSON value (unknown modes: exact)."""
    try:
        if mode == "unordered":
            if not (isinstance(got, list) and isinstance(expected, list)):
                return False
            return sorted(map(_sort_key, got)) == sorted(map(_sort_key, expected))
        if mode == "unordered_nested":
            if not (isinstance(got, list) and isinstance(expected, list)):
                return False
            if not all(isinstance(inner, list) for inner in [*got, *expected]):
                return False

            def canonical(outer: list[Any]) -> list[str]:
                return sorted(_sort_key(sorted(inner, key=_sort_key)) for inner in outer)

            return canonical(got) == canonical(expected)
        if mode == "float":
            return _close(got, expected)
        return bool(got == expected)
    except Exception:
        return False


def _shown(value: Any) -> tuple[Any, bool]:
    """(value, False) if it survives JSON as the browser reads it, else (its repr, True)."""
    try:
        json.dumps(value, allow_nan=False)
    except Exception:
        return _safe_repr(value), True
    return value, False


_CONTAINERS = (list, tuple, deque, set, frozenset, dict)
_SIZED = (str, *_CONTAINERS)


def _too_large(value: Any) -> bool:
    """Whether reading `value` means more than MAX_RESULT_ITEMS items. Shared parts count
    each time they appear (JSON repeats them); a container inside itself counts once."""
    budget = MAX_RESULT_ITEMS
    path: set[int] = set()  # containers being read, to stop at a cycle
    stack: list[tuple[Any, bool]] = [(value, False)]
    while stack:
        item, leaving = stack.pop()
        if leaving:
            path.discard(id(item))
            continue
        if isinstance(item, str):
            budget -= len(item) // 100
        elif isinstance(item, _CONTAINERS) and id(item) not in path:
            budget -= len(item)
            if budget < 0:
                return True
            path.add(id(item))
            stack.append((item, True))
            children = item.values() if isinstance(item, dict) else item
            stack.extend((child, False) for child in children if isinstance(child, _SIZED))
        if budget < 0:
            return True
    return False


def _preview(value: Any) -> str:
    """The start of a large value, as a repr."""
    if isinstance(value, str):
        return _safe_repr(value[: MAX_SHORT * 2]) + f"... ({len(value):,} characters)"
    if isinstance(value, dict):
        items = list(zip(range(MAX_PREVIEW_ITEMS), value.items(), strict=False))
        shown = [
            f"{_safe_repr(key)[:MAX_SHORT]}: {_preview_item(item)}" for _, (key, item) in items
        ]
        return "{" + ", ".join(shown) + f", ... ({len(value):,} entries)}}"
    if isinstance(value, _CONTAINERS):
        items = [item for _, item in zip(range(MAX_PREVIEW_ITEMS), value, strict=False)]
        shown = [_preview_item(item) for item in items]
        return "[" + ", ".join(shown) + f", ... ({len(value):,} items)]"
    return _safe_repr(value)[: MAX_SHORT * 2]


def _preview_item(item: Any) -> str:
    if isinstance(item, _CONTAINERS):
        return f"<{type(item).__name__} of {len(item):,}>"
    return _safe_repr(item)[:MAX_SHORT]


def _too_large_note() -> str:
    return (
        f"The result holds more than {MAX_RESULT_ITEMS:,} items, too many to check or show; "
        "no test expects one that large. Does a loop add too much?"
    )


def _format_error(exc: BaseException) -> str:
    """The exception with only the user's own frames, innermost last."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == SOLUTION_FILE]
    lines = traceback.format_exception_only(type(exc), exc)
    if frames:
        shown = traceback.format_list(frames[-MAX_TRACEBACK_FRAMES:])
        lines = ["Traceback (most recent call last):\n", *shown, *lines]
    return "".join(lines)


def _reason(exc: BaseException) -> str:
    """One line: the message of a ConversionError, else `Type: message`."""
    if isinstance(exc, ConversionError | SpecError):
        return str(exc)
    return "".join(traceback.format_exception_only(type(exc), exc)).strip()


def _elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 2)


class _TestRun:
    """One test's stdout, clock and result."""

    def __init__(self, test: Mapping[str, Any], stdout: str) -> None:
        self.id = test.get("id")
        self.buffer = _Output()
        self.buffer.write(stdout)
        self.start = time.perf_counter()

    def output(self) -> str:
        return self.buffer.getvalue()[:MAX_STDOUT]

    def error(self, message: str) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": "error",
            "error": message,
            "stdout": self.output(),
            "ms": _elapsed_ms(self.start),
        }

    def result(self, passed: bool, got: Any, ms: float, note: str | None) -> dict[str, Any]:
        shown, is_repr = _shown(got)
        result = {"id": self.id, "status": "pass" if passed else "fail", "got": shown}
        if is_repr:
            result["gotRepr"] = True
        result.update(stdout=self.output(), ms=ms)
        if note is not None:
            result["error"] = note
        return result

    def too_large(self, got: Any, ms: float) -> dict[str, Any]:
        result = self.result(False, None, ms, _too_large_note())
        result.update(got=_preview(got), gotRepr=True)
        return result


# ---------------------------------------------------------------- checkers


@dataclass(frozen=True)
class _Checker:
    check: Callable[[Any, Any], Any] | None = None
    # Why tests that compare with the checker cannot run, when `check` is None.
    problem: str = 'This test compares with "checker", but the problem has no checker.'

    def judge(self, args: Any, got: Any) -> tuple[bool, str | None]:
        """(passed, why it failed when the checker itself went wrong)."""
        assert self.check is not None
        try:
            with _capture(_Output()):
                verdict = self.check(copy.deepcopy(args), copy.deepcopy(got))
        except KeyboardInterrupt:
            raise
        except BaseException as exc:
            return False, f"The checker could not judge this answer: {_checker_error(exc)}"
        if verdict is True or verdict is False:
            return verdict, None
        return False, f"The checker returned {_safe_repr(verdict)}, not True or False."


def _checker_error(exc: BaseException) -> str:
    if isinstance(exc, SyntaxError) and exc.filename == CHECKER_FILE:
        return f"SyntaxError: {exc.msg} (checker line {exc.lineno})"
    frames = traceback.extract_tb(exc.__traceback__)
    lines = [frame.lineno for frame in frames if frame.filename == CHECKER_FILE]
    where = f" (checker line {lines[-1]})" if lines else ""
    return f"{_reason(exc)}{where}"


def _load_checker(code: str | None) -> _Checker:
    if code is None:
        return _Checker()
    namespace = new_namespace()
    try:
        with _capture(_Output()):
            exec(compile(code, CHECKER_FILE, "exec"), namespace)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        return _Checker(problem=f"The problem's checker does not load: {_checker_error(exc)}")
    check = namespace.get("check")
    if not callable(check):
        return _Checker(problem="The problem's checker defines no check(args, got) function.")
    return _Checker(check)


def _judge(
    test: Mapping[str, Any], key: str, got: Any, mode: str, checker: _Checker
) -> tuple[bool, str | None]:
    if mode == "checker":
        return checker.judge(test.get(key, []), got)
    # A custom case can leave out "expected" (Section 7.5); it then compares with None.
    return _equal(got, test.get("expected"), mode), None


# ---------------------------------------------------------------- function problems


def _solution_class(namespace: dict[str, Any], entry: str) -> type:
    solution_class = namespace.get("Solution")
    if not isinstance(solution_class, type):
        raise NameError("Define a class named Solution.")
    if not callable(getattr(solution_class, entry, None)):
        raise AttributeError(f"Solution has no method named {entry!r}.")
    return solution_class


def _run_function(
    solution_class: type,
    entry: str,
    test: Mapping[str, Any],
    mode: str,
    stdout: str,
    spec: Spec,
    classes: dict[str, type],
    checker: _Checker,
) -> dict[str, Any]:
    run = _TestRun(test, stdout)
    io_spec = spec.io
    build = _Build(classes)
    try:
        # Fresh arguments for every test, so changes to them cannot reach the next one.
        args = _convert_args(copy.deepcopy(test.get("args", [])), io_spec, build)
    except Exception as exc:
        return run.error(f"Could not build the arguments: {_reason(exc)}\n")
    if mode == "checker" and checker.check is None:
        return run.error(checker.problem + "\n")
    try:
        with _capture(run.buffer):
            # A fresh instance per test, so state kept on `self` cannot leak between tests.
            method = getattr(solution_class(), entry)
            returned = method(*args)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # SystemExit, GeneratorExit and custom ones included
        return run.error(_format_error(exc))
    ms = _elapsed_ms(run.start)
    what = "the returned value"
    try:
        if io_spec is not None and io_spec.in_place is not None:
            name, kind = io_spec.params[io_spec.in_place]
            what = f"{name} after the call"
            # The argument is the input itself, so no copy check: a new _Build.
            value = _to_json(args[io_spec.in_place], kind, _Build(classes))
        elif io_spec is not None:
            value = _to_json(returned, io_spec.returns, build)
        else:
            value = returned
        if _too_large(value):
            return run.too_large(value, ms)
        got = _normalize(value)
        passed, note = _judge(test, "args", got, mode, checker)
        if build.reused is not None:
            passed = False
            note = (
                f"The result reuses nodes of the input {build.reused}: a deep copy is made of "
                "new Node objects."
            )
        return run.result(passed, got, ms, note)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # e.g. a list that contains itself, or a raising __eq__
        return run.error(f"Could not read {what}: {_reason(exc)}\n")


# ---------------------------------------------------------------- design problems


def _design_class(namespace: dict[str, Any], entry: str) -> type:
    design_class = namespace.get(entry)
    if not isinstance(design_class, type):
        raise NameError(f"Define a class named {entry}.")
    return design_class


def _check_ops(ops: Any, entry: str) -> list[list[Any]]:
    """A design test's calls, checked before anything runs."""
    if not isinstance(ops, list) or not ops:
        raise SpecError('A design test needs "ops": a list of calls, the constructor first.')
    for i, op in enumerate(ops):
        if not isinstance(op, list) or not op or not isinstance(op[0], str):
            raise SpecError(f"Call {i + 1} should be [name, ...args], not {_short(op)}.")
        refs = [arg for arg in op[1:] if isinstance(arg, dict) and REF_KEY in arg]
        for ref in refs:
            if set(ref) != {REF_KEY} or not _is_index(ref[REF_KEY], i):
                raise SpecError(
                    f'Call {i + 1}: {_short(ref)} should be {{"$ref": n}}, where n is the '
                    f"index of an earlier call (0 to {i - 1})."
                )
    if ops[0][0] != entry:
        raise SpecError(f"The first call must construct {entry}, not call {ops[0][0]!r}.")
    return ops


def resolve_refs(args: Sequence[Any], outputs: Sequence[Any]) -> list[Any]:
    """A design call's arguments, each {"$ref": i} replaced by what call i returned."""
    return [
        outputs[arg[REF_KEY]] if isinstance(arg, dict) and REF_KEY in arg else arg for arg in args
    ]


def _call_text(op: Sequence[Any]) -> str:
    parts = []
    for arg in op[1:]:
        if isinstance(arg, dict) and REF_KEY in arg:
            parts.append(f"<what call {arg[REF_KEY] + 1} returned>")
        else:
            parts.append(_short(arg))
    return f"{op[0]}({', '.join(parts)})"


def _run_design(
    design_class: type,
    entry: str,
    test: Mapping[str, Any],
    mode: str,
    stdout: str,
    checker: _Checker,
) -> dict[str, Any]:
    run = _TestRun(test, stdout)
    try:
        ops = _check_ops(copy.deepcopy(test.get("ops")), entry)
    except SpecError as exc:
        return run.error(f"{exc}\n")
    if mode == "checker" and checker.check is None:
        return run.error(checker.problem + "\n")
    outputs: list[Any] = []
    try:
        with _capture(run.buffer):
            # A fresh instance per test: the constructor call.
            instance = design_class(*resolve_refs(ops[0][1:], outputs))
            outputs.append(None)
            for name, *args in ops[1:]:
                method = getattr(instance, name, None)
                if not callable(method):
                    raise AttributeError(f"{entry} has no method named {name!r}.")
                outputs.append(method(*resolve_refs(args, outputs)))
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        call = len(outputs)  # the call that failed
        where = f"In call {call + 1} of {len(ops)}, {_call_text(ops[call])}:\n"
        return run.error(where + _format_error(exc))
    ms = _elapsed_ms(run.start)
    try:
        if _too_large(outputs):
            return run.too_large(outputs, ms)
        got = _normalize(outputs)
        passed, note = _judge(test, "ops", got, mode, checker)
        return run.result(passed, got, ms, note)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        return run.error(f"Could not read the returned values: {_reason(exc)}\n")


# ---------------------------------------------------------------- entry point


def _error_for_all(tests: list[dict[str, Any]], message: str, stdout: str) -> str:
    return json.dumps(
        [{"id": t.get("id"), "status": "error", "error": message, "stdout": stdout} for t in tests]
    )


def run_tests(
    code: str, entry: str, tests_json: str, mode: str = "exact", spec_json: str | None = None
) -> str:
    """Run every test (see the module docstring); returns a JSON list of TestResult.

    Each test may set its own `compare` mode; `mode` is the default. Every test gets a new
    instance and a deep copy of its arguments, so state kept on `self` and changes to the
    arguments cannot reach the next test.
    """
    tests: list[dict[str, Any]] = json.loads(tests_json)
    try:
        spec = parse_spec(spec_json)
    except SpecError as exc:
        return _error_for_all(tests, f"The problem's spec_json is invalid: {exc}\n", "")
    # Lets tracebacks show the offending line of the user's code.
    linecache.cache[SOLUTION_FILE] = (len(code), None, code.splitlines(True), SOLUTION_FILE)
    namespace = new_namespace(spec)
    classes = _node_classes(namespace)
    module_stdout = _Output()
    try:
        with _capture(module_stdout):
            exec(compile(code, SOLUTION_FILE, "exec"), namespace)
            if spec.kind == "design":
                target = _design_class(namespace, entry)
            else:
                target = _solution_class(namespace, entry)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        return _error_for_all(tests, _format_error(exc), module_stdout.getvalue()[:MAX_STDOUT])

    checker = _load_checker(spec.checker)
    results = []
    # Output printed while the code was loading is shown with the first test.
    stdout = module_stdout.getvalue()
    for test in tests:
        test_mode = test.get("compare") or mode
        if spec.kind == "design":
            results.append(_run_design(target, entry, test, test_mode, stdout, checker))
        else:
            results.append(
                _run_function(target, entry, test, test_mode, stdout, spec, classes, checker)
            )
        stdout = ""
    return json.dumps(results)

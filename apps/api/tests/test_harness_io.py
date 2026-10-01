"""Typed parameters in the test harness (docs/PARITY_PLAN.md 4.1): the prelude's node
classes, every io type in both directions, in-place parameters and their errors."""

import re
from typing import Any

import pytest

from tests.harness_helpers import case, harness, returning, run


def _io(params: list[tuple[str, str]], returns: str = "json", in_place: str | None = None) -> Any:
    return {
        "io": {
            "params": [{"name": name, "type": kind} for name, kind in params],
            "returns": returns,
            "inPlace": in_place,
        }
    }


def _echo(param: str, kind: str, body: str = "return x") -> tuple[str, dict[str, Any]]:
    """A method `f(self, x)` and a spec typing `x` (and the result) as `kind`."""
    code = f"class Solution:\n    def f(self, x):\n        {body}\n"
    return code, _io([("x", param)], kind)


def _one(code: str, args: list[Any], expected: Any, spec: dict[str, Any]) -> dict[str, Any]:
    [result] = run(code, [case(args, expected)], spec=spec)
    return dict(result)


# ---------------------------------------------------------------- the prelude's node classes


def test_listnode_and_treenode_are_leetcodes() -> None:
    namespace = harness.new_namespace()
    node = namespace["ListNode"]()
    assert (node.val, node.next) == (0, None)
    tree = namespace["TreeNode"](5)
    assert (tree.val, tree.left, tree.right) == (5, None, None)
    # Like LeetCode's, nodes compare and hash by identity (visited sets of nodes work).
    first, second = namespace["ListNode"](1), namespace["ListNode"](1)
    assert first != second
    assert len({first, second, first}) == 2
    assert "Node" not in namespace  # only a random_list or graph_node problem gets it


def test_pasted_leetcode_code_runs_with_the_prelude_names() -> None:
    code = (
        "# Definition for singly-linked list.\n"
        "# class ListNode:\n"
        "#     def __init__(self, val=0, next=None):\n"
        "class Solution:\n"
        "    def f(self, head: Optional[ListNode], root: Optional[TreeNode]) -> int:\n"
        "        dummy = ListNode(0, head)\n"
        "        return dummy.next.val + TreeNode(4, root).left.val\n"
    )
    spec = _io([("head", "list_node"), ("root", "tree_node")])
    assert _one(code, [[2], [3]], 5, spec)["status"] == "pass"


@pytest.mark.parametrize(
    ("kind", "build", "attributes"),
    [
        ("random_list", "Node('7')", {"val": 7, "next": None, "random": None}),
        ("graph_node", "Node()", {"val": 0, "neighbors": []}),
    ],
)
def test_the_node_class_follows_the_io_type(
    kind: str, build: str, attributes: dict[str, Any]
) -> None:
    spec = harness.parse_spec({"io": {"params": [{"name": "x", "type": kind}]}})
    node = eval(build, harness.new_namespace(spec))
    assert {key: getattr(node, key) for key in attributes} == attributes


def test_graph_nodes_do_not_share_a_neighbors_list() -> None:
    spec = harness.parse_spec({"io": {"returns": "graph_node"}})
    namespace = harness.new_namespace(spec)
    first, second = namespace["Node"](1), namespace["Node"](2)
    first.neighbors.append(second)
    assert second.neighbors == []


def test_each_run_gets_new_node_classes() -> None:
    """`ListNode.__lt__ = ...` (a heap trick) must not leak into the next run."""
    patched = (
        "ListNode.__lt__ = lambda a, b: a.val < b.val\n"
        "class Solution:\n"
        "    def f(self):\n"
        "        return ListNode(1) < ListNode(2)\n"
    )
    plain = "class Solution:\n    def f(self):\n        return ListNode(1) < ListNode(2)\n"
    assert run(patched, [case([], True)])[0]["status"] == "pass"
    [result] = run(plain, [case([], True)])
    assert result["status"] == "error"
    assert "TypeError: '<' not supported" in result["error"]


def test_code_that_defines_its_own_listnode_still_works() -> None:
    """Arguments are built with the prelude's class; results are read by attribute."""
    code = (
        "class ListNode:\n"
        "    def __init__(self, x):\n"
        "        self.val = x\n"
        "        self.next = None\n"
        "\n"
        "class Solution:\n"
        "    def f(self, x):\n"
        "        node = ListNode(0)\n"
        "        node.next = x\n"
        "        return node\n"
    )
    spec = _io([("x", "list_node")], "list_node")
    assert _one(code, [[1, 2]], [0, 1, 2], spec)["status"] == "pass"


def test_node_reprs_are_readable() -> None:
    namespace = harness.new_namespace()
    list_node, tree_node = namespace["ListNode"], namespace["TreeNode"]
    head = list_node(1, list_node(2, list_node(3)))
    assert repr(head) == "ListNode(1 -> 2 -> 3)"
    assert repr(head.next) == "ListNode(2 -> 3)"
    head.next.next.next = head.next
    assert repr(head) == "ListNode(1 -> 2 -> 3 -> (cycle))"
    long = None
    for value in range(30, 0, -1):
        long = list_node(value, long)
    assert repr(long) == f"ListNode({' -> '.join(map(str, range(1, 21)))} -> ...)"
    root = tree_node(1, None, tree_node(2, tree_node(3)))
    assert repr(root) == "TreeNode([1, None, 2, 3])"
    root.right.right = root
    assert repr(root) == "TreeNode([1, None, 2, 3, (cycle)])"
    assert repr(tree_node("a")) == "TreeNode(['a'])"
    assert str(list_node()) == "ListNode(0)"


def test_node_reprs_are_safe_and_bounded() -> None:
    namespace = harness.new_namespace()
    list_node, tree_node = namespace["ListNode"], namespace["TreeNode"]

    class Loud:
        def __repr__(self) -> str:
            raise ValueError("no")

    assert repr(list_node(Loud())) == "ListNode(<Loud>)"
    wide = tree_node(0)
    level = [wide]
    for _ in range(5):
        children = []
        for node in level:
            node.left, node.right = tree_node(1), tree_node(1)
            children += [node.left, node.right]
        level = children
    shown = repr(wide)
    assert shown.endswith(", ...])")
    assert shown.count("1") == harness.MAX_REPR_NODES - 1


def test_node_reprs_of_the_two_node_classes() -> None:
    random_spec = harness.parse_spec(_io([("x", "random_list")]))
    node = harness.new_namespace(random_spec)["Node"]
    first = node(7)
    first.next = first.random = node(13)
    assert repr(first) == "Node(7, next=13, random=13)"
    assert repr(first.next) == "Node(13, next=None, random=None)"
    graph = harness.new_namespace(harness.parse_spec(_io([("x", "graph_node")])))["Node"]
    hub = graph(1)
    hub.neighbors = [graph(value) for value in range(2, 25)]
    assert repr(hub) == f"Node(1, neighbors=[{', '.join(map(str, range(2, 22)))}, ...])"
    assert repr(graph(3)) == "Node(3, neighbors=[])"


def test_printing_a_node_shows_it() -> None:
    code = "class Solution:\n    def f(self, x):\n        print(x)\n        return x\n"
    result = _one(code, [[4, 5]], [4, 5], _io([("x", "list_node")], "list_node"))
    assert result["stdout"] == "ListNode(4 -> 5)\n"


# ---------------------------------------------------------------- list_node


@pytest.mark.parametrize("values", [[1, 2, 3], [7], [], [0, None, "a", [1]], [-5, -5]])
def test_list_node_round_trips(values: list[Any]) -> None:
    code, spec = _echo("list_node", "list_node")
    result = _one(code, [values], values, spec)
    assert (result["status"], result["got"]) == ("pass", values)


def test_list_node_arguments_are_listnodes() -> None:
    code, spec = _echo(
        "list_node", "json", "return [type(x).__name__, x.val, x.next.val, x.next.next]"
    )
    assert _one(code, [[1, 2]], ["ListNode", 1, 2, None], spec)["status"] == "pass"
    empty, spec = _echo("list_node", "json", "return x is None")
    assert _one(empty, [[]], True, spec)["status"] == "pass"


def test_returning_none_for_a_list_is_the_empty_list() -> None:
    code, spec = _echo("list_node", "list_node", "return None")
    assert _one(code, [[1]], [], spec)["status"] == "pass"


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (5, "expected a list of values, got 5"),
        ("123", 'expected a list of values, got "123"'),
        ({"values": [1]}, 'expected a list of values, got {"values": [1]}'),
    ],
)
def test_a_list_node_argument_must_be_a_list(value: Any, message: str) -> None:
    code, spec = _echo("list_node", "list_node")
    result = _one(code, [value], [], spec)
    assert result["status"] == "error"
    assert result["error"] == f"Could not build the arguments: x (list_node): {message}\n"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ("return [3, 2, 1]", "expected a ListNode or None, got list"),
        ("return x.val", "expected a ListNode or None, got int"),
        ("x.next = x\n        return x", "the list has a cycle: node 1 links back to node 1"),
        (
            "x.next.next.next = x.next\n        return x",
            "the list has a cycle: node 3 links back to node 2",
        ),
    ],
)
def test_a_list_node_result_must_be_a_list_without_cycles(body: str, message: str) -> None:
    code, spec = _echo("list_node", "list_node", body)
    result = _one(code, [[1, 2, 3]], [1, 2, 3], spec)
    assert result["status"] == "error"
    assert result["error"] == f"Could not read the returned value: {message}\n"


def test_a_huge_result_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(harness, "MAX_NODES", 4)
    code, spec = _echo("list_node", "list_node")
    assert _one(code, [[1, 2, 3, 4]], [1, 2, 3, 4], spec)["status"] == "pass"
    result = _one(code, [[1, 2, 3, 4, 5]], [], spec)
    assert result["error"] == "Could not read the returned value: the list has more than 4 nodes\n"
    tree, spec = _echo("tree_node", "tree_node")
    assert "the tree has more than 4 nodes" in _one(tree, [[1, 2, 3, 4, 5]], [], spec)["error"]


def test_each_test_gets_new_nodes() -> None:
    code = "class Solution:\n    def f(self, x):\n        x.val += 10\n        return x\n"
    shared = [1]
    spec = _io([("x", "list_node")], "list_node")
    results = run(code, [case([shared], [11], id="a"), case([shared], [11], id="b")], spec=spec)
    assert [r["status"] for r in results] == ["pass", "pass"]


# ---------------------------------------------------------------- tree_node


@pytest.mark.parametrize(
    "values",
    [
        [1, 2, 3, None, 4],
        [1, None, 2, None, 3],
        [5],
        [],
        [3, 9, 20, None, None, 15, 7],
        [1, 2, None, 3, None, 4],
        [0, -1, None, None, "x"],
    ],
)
def test_tree_node_round_trips(values: list[Any]) -> None:
    code, spec = _echo("tree_node", "tree_node")
    result = _one(code, [values], values, spec)
    assert (result["status"], result["got"]) == ("pass", values)


def test_tree_node_arguments_follow_leetcodes_level_order() -> None:
    body = "return [x.val, x.left.val, x.right, x.left.left, x.left.right.val]"
    code, spec = _echo("tree_node", "json", body)
    assert _one(code, [[1, 2, None, None, 3]], [1, 2, None, None, 3], spec)["status"] == "pass"


@pytest.mark.parametrize(
    ("values", "got"),
    [
        ([1, 2, None], [1, 2]),
        ([1, None, None], [1]),
        ([None], []),
        ([1, 2, 3, None, None], [1, 2, 3]),
    ],
)
def test_trailing_nulls_are_accepted_and_left_out_of_results(values: list[Any], got: Any) -> None:
    code, spec = _echo("tree_node", "tree_node")
    assert _one(code, [values], got, spec)["got"] == got


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (7, "expected a level-order list, got 7"),
        (
            [1, None, None, 5],
            "5 at index 3 has no parent: the nodes before it have no free child slot",
        ),
        ([None, 1], "the root is null, so no other value has a parent"),
        ([1, 2, 3, None, None, None, None, None, 8], "8 at index 8 has no parent"),
    ],
)
def test_a_tree_node_argument_must_place_every_value(value: Any, message: str) -> None:
    code, spec = _echo("tree_node", "tree_node")
    result = _one(code, [value], [], spec)
    assert result["status"] == "error"
    assert result["error"].startswith(f"Could not build the arguments: x (tree_node): {message}")


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ("return [1, 2]", "expected a TreeNode or None, got list"),
        ("x.left.left = x\n        return x", "the node with val 1 is reached twice"),
        ("x.right = x.left\n        return x", "the node with val 2 is reached twice"),
    ],
)
def test_a_tree_node_result_must_be_a_tree(body: str, message: str) -> None:
    code, spec = _echo("tree_node", "tree_node", body)
    result = _one(code, [[1, 2, 3]], [1, 2, 3], spec)
    assert result["status"] == "error"
    assert result["error"].startswith(f"Could not read the returned value: {message}")


# ---------------------------------------------------------------- lists of nodes


def test_list_node_lists_convert_each_item() -> None:
    body = "return [None if n is None else n.val for n in x]"
    code, spec = _echo("list_node[]", "json", body)
    assert _one(code, [[[1, 2], [], [3]]], [1, None, 3], spec)["status"] == "pass"
    nested, spec = _echo("list_node[]", "list_node[]", "return x[::-1]")
    assert _one(nested, [[[1, 2], [], [3]]], [[3], [], [1, 2]], spec)["status"] == "pass"


def test_tree_node_lists_convert_each_item() -> None:
    code, spec = _echo("tree_node[]", "tree_node[]", "return [t.left if t else t for t in x]")
    result = _one(code, [[[1, 2], [], [3, None, 4]]], [[2], [], []], spec)
    assert result["status"] == "pass"


def test_a_list_of_nodes_must_be_a_list() -> None:
    code, spec = _echo("list_node[]", "list_node[]", "return x[0]")
    built = _one(code, [5], [], spec)
    assert (
        built["error"] == "Could not build the arguments: x (list_node[]): expected a list, got 5\n"
    )
    read = _one(code, [[[1]]], [], spec)
    assert read["error"] == "Could not read the returned value: expected a list, got ListNode\n"


# ---------------------------------------------------------------- random_list

COPY_LIST = (
    "class Solution:\n"
    "    def f(self, x):\n"
    "        copies = {None: None}\n"
    "        node = x\n"
    "        while node:\n"
    "            copies[node] = Node(node.val)\n"
    "            node = node.next\n"
    "        for old, new in copies.items():\n"
    "            if old:\n"
    "                new.next = copies[old.next]\n"
    "                new.random = copies[old.random]\n"
    "        return copies[x]\n"
)
RANDOM = _io([("x", "random_list")], "random_list")


@pytest.mark.parametrize(
    "pairs",
    [[[7, None], [13, 0], [11, 4], [10, 2], [1, 0]], [[5, 0]], [], [[1, 1], [2, 1]], [[-3, None]]],
)
def test_random_list_round_trips_through_a_deep_copy(pairs: list[Any]) -> None:
    result = _one(COPY_LIST, [pairs], pairs, RANDOM)
    assert (result["status"], result["got"]) == ("pass", pairs)


def test_random_list_arguments_are_linked_nodes() -> None:
    body = "return [x.val, x.next.val, x.random.val, x.next.random is x, x.next.next]"
    code, spec = _echo("random_list", "json", body)
    assert _one(code, [[[4, 1], [6, 0]]], [4, 6, 6, True, None], spec)["status"] == "pass"


def test_returning_the_input_list_fails_with_a_note() -> None:
    code, spec = _echo("random_list", "random_list")
    pairs = [[7, None], [13, 0]]
    result = _one(code, [pairs], pairs, spec)
    assert result["status"] == "fail"
    assert result["got"] == pairs
    assert result["error"] == (
        "The result reuses nodes of the input list: a deep copy is made of new Node objects."
    )


def test_a_copy_whose_random_points_into_the_input_fails() -> None:
    body = "copy = Node(x.val)\n        copy.random = x\n        return copy"
    code, spec = _echo("random_list", "random_list", body)
    result = _one(code, [[[1, 0]]], [[1, 0]], spec)
    assert result["error"] == (
        "Could not read the returned value: node 1's random points into the input list; "
        "point it at a node of the copy\n"
    )
    outside = "copy = Node(1)\n        copy.random = Node(2)\n        return copy"
    code, spec = _echo("random_list", "random_list", outside)
    assert (
        "node 1's random points to a node outside the list" in _one(code, [[]], [], spec)["error"]
    )


def test_a_random_list_result_with_a_cycle_is_an_error() -> None:
    body = "copy = Node(1)\n        copy.next = copy\n        return copy"
    code, spec = _echo("random_list", "random_list", body)
    result = _one(code, [[]], [], spec)
    assert result["error"] == (
        "Could not read the returned value: the list has a cycle: node 1 links back to node 1\n"
    )


@pytest.mark.parametrize(
    ("pairs", "message"),
    [
        ([[1]], "item 0 should be [val, randomIndex], got [1]"),
        ([[1, 2]], "item 0: randomIndex 2 is not null or an index from 0 to 0"),
        ([[1, True]], "item 0: randomIndex true is not null or an index from 0 to 0"),
        ([[1, -1]], "item 0: randomIndex -1 is not null or an index from 0 to 0"),
        (3, "expected a list of [val, randomIndex] pairs, got 3"),
        ([["a", None]], "ValueError: invalid literal for int() with base 10: 'a'"),
    ],
)
def test_bad_random_lists_are_reported(pairs: Any, message: str) -> None:
    result = _one(COPY_LIST, [pairs], [], RANDOM)
    assert result["error"] == f"Could not build the arguments: x (random_list): {message}\n"


# ---------------------------------------------------------------- graph_node

CLONE = (
    "class Solution:\n"
    "    def f(self, x):\n"
    "        copies = {}\n"
    "        def clone(old):\n"
    "            if old not in copies:\n"
    "                copies[old] = Node(old.val)\n"
    "                copies[old].neighbors = [clone(n) for n in old.neighbors]\n"
    "            return copies[old]\n"
    "        return clone(x) if x else None\n"
)
GRAPH = _io([("x", "graph_node")], "graph_node")


@pytest.mark.parametrize(
    "adjacency",
    [
        [[2, 4], [1, 3], [2, 4], [1, 3]],
        [[]],
        [],
        [[2], [1]],
        [[3, 2], [1], [1]],  # neighbor order is kept
        [[2, 3, 4], [1], [1], [1]],
    ],
)
def test_graph_node_round_trips_through_a_clone(adjacency: list[Any]) -> None:
    result = _one(CLONE, [adjacency], adjacency, GRAPH)
    assert (result["status"], result["got"]) == ("pass", adjacency)


def test_the_method_gets_node_1() -> None:
    body = "return [x.val, [n.val for n in x.neighbors], x.neighbors[0].neighbors[0] is x]"
    code, spec = _echo("graph_node", "json", body)
    assert _one(code, [[[2], [1]]], [1, [2], True], spec)["status"] == "pass"


def test_returning_the_input_graph_fails_with_a_note() -> None:
    code, spec = _echo("graph_node", "graph_node")
    result = _one(code, [[[2], [1]]], [[2], [1]], spec)
    assert (result["status"], result["got"]) == ("fail", [[2], [1]])
    assert result["error"] == (
        "The result reuses nodes of the input graph: a deep copy is made of new Node objects."
    )


def test_a_clone_that_copies_a_node_twice_is_reported() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, x):\n"
        "        def clone(old, depth):\n"
        "            new = Node(old.val)\n"
        "            if depth < 2:\n"
        "                new.neighbors = [clone(n, depth + 1) for n in old.neighbors]\n"
        "            return new\n"
        "        return clone(x, 0)\n"
    )
    result = _one(code, [[[2], [1]]], [[2], [1]], GRAPH)
    assert result["error"] == (
        "Could not read the returned value: node values should be 1 to 3, each once (found 1, "
        "2, 1); was a node copied twice?\n"
    )


@pytest.mark.parametrize(
    ("adjacency", "message"),
    [
        (
            [[2], [1], []],
            "node(s) 3 cannot be reached from node 1, and the method only gets node 1",
        ),
        ([[3]], "node 1 lists neighbor 3; node values go from 1 to 1"),
        ([[0], []], "node 1 lists neighbor 0; node values go from 1 to 2"),
        ([["2"], []], 'node 1 lists neighbor "2"; node values go from 1 to 2'),
        ([1, 2], "expected an adjacency list (a list of lists), got [1, 2]"),
    ],
)
def test_bad_adjacency_lists_are_reported(adjacency: Any, message: str) -> None:
    result = _one(CLONE, [adjacency], [], GRAPH)
    assert result["error"] == f"Could not build the arguments: x (graph_node): {message}\n"


def test_a_graph_result_must_hold_nodes() -> None:
    code, spec = _echo("graph_node", "graph_node", "return [1]")
    assert "expected a Node or None, got list" in _one(code, [[[]]], [], spec)["error"]
    broken = "copy = Node(1)\n        copy.neighbors = None\n        return copy"
    code, spec = _echo("graph_node", "graph_node", broken)
    assert "neighbors should be a list, got NoneType" in _one(code, [[[]]], [], spec)["error"]


# ---------------------------------------------------------------- in place

ROTATE = (
    "class Solution:\n"
    "    def rotate(self, matrix):\n"
    "        matrix[:] = [list(row) for row in zip(*matrix[::-1])]\n"
    "        return 'ignored'\n"
)


def test_in_place_compares_the_parameter_after_the_call() -> None:
    spec = _io([("matrix", "json")], in_place="matrix")
    tests = [case([[[1, 2], [3, 4]]], [[3, 1], [4, 2]]), case([[[5]]], [[5]], id="u")]
    results = run(ROTATE, tests, entry="rotate", spec=spec)
    assert [(r["status"], r["got"]) for r in results] == [
        ("pass", [[3, 1], [4, 2]]),
        ("pass", [[5]]),
    ]


def test_in_place_picks_its_parameter_by_position() -> None:
    code = "class Solution:\n    def f(self, a, b):\n        a.append(1)\n        b.append(2)\n"
    spec = _io([("a", "json"), ("b", "json")], in_place="b")
    assert _one(code, [[], [0]], [0, 2], spec)["status"] == "pass"


def test_in_place_nodes_are_read_after_the_call() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, head):\n"
        "        second = head.next\n"
        "        head.next = second.next\n"
        "        second.next = None\n"
    )
    spec = _io([("head", "list_node")], in_place="head")
    assert _one(code, [[1, 2, 3]], [1, 3], spec)["status"] == "pass"
    looped = "class Solution:\n    def f(self, head):\n        head.next.next = head\n"
    result = _one(looped, [[1, 2]], [1, 2], spec)
    assert result["error"] == (
        "Could not read head after the call: the list has a cycle: node 2 links back to node 1\n"
    )


# ---------------------------------------------------------------- arguments and specs


def test_argument_count_must_match_io_params() -> None:
    code, spec = _echo("list_node", "list_node")
    [result] = run(code, [case([[1], 2], [])], spec=spec)
    assert result["error"] == "Could not build the arguments: expected 1 argument(s) (x), got 2\n"


def test_io_with_only_a_return_type_keeps_the_arguments() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, values):\n"
        "        head = None\n"
        "        for value in reversed(values):\n"
        "            head = ListNode(value, head)\n"
        "        return head\n"
    )
    assert _one(code, [[1, 2]], [1, 2], {"io": {"returns": "list_node"}})["status"] == "pass"


def test_custom_cases_without_expected_still_show_converted_results() -> None:
    code, spec = _echo("list_node", "list_node")
    [result] = run(code, [{"id": "custom", "args": [[4, 2]]}], spec=spec)
    assert (result["status"], result["got"]) == ("fail", [4, 2])


def test_convert_args_builds_what_run_tests_builds() -> None:
    spec = harness.parse_spec(_io([("head", "list_node"), ("k", "json")]))
    namespace = harness.new_namespace(spec)
    head, k = harness.convert_args([[1, 2], 3], spec, namespace)
    assert (type(head) is namespace["ListNode"], head.val, head.next.val, k) == (True, 1, 2, 3)
    with pytest.raises(harness.ConversionError, match=r"head \(list_node\): expected a list"):
        harness.convert_args([4, 3], spec, namespace)
    assert harness.convert_args([[1]], harness.parse_spec(None), namespace) == [[1]]


def test_parse_spec_defaults() -> None:
    for empty in (None, "", "  ", "null", "{}", {}, {"kind": None, "io": None, "checker": None}):
        assert harness.parse_spec(empty) == harness.Spec()
    spec = harness.parse_spec(
        '{"io": {"params": [{"name": "a"}, {"name": "b", "type": "tree_node"}], '
        '"inPlace": "b"}, "checker": "def check(a, g): return True"}'
    )
    assert spec.kind == "function"
    assert spec.io == harness.Io((("a", "json"), ("b", "tree_node")), "json", 1)
    assert spec.checker == "def check(a, g): return True"
    assert harness.parse_spec(spec) is spec


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        ("{nope", "not valid JSON"),
        ("[1]", "expected a JSON object"),
        ({"kind": "class"}, "unknown kind 'class' (expected 'function' or 'design')"),
        ({"checker": 5}, "checker must be Python code, as a string"),
        ({"kind": "design", "io": {}}, "io applies to function problems only"),
        ({"io": []}, "io must be an object"),
        ({"io": {"params": {}}}, "io.params must be a list"),
        ({"io": {"params": [{"type": "json"}]}}, 'io.params[0] must be {"name": ..., "type": ...}'),
        ({"io": {"returns": "linked_list"}}, "io.returns: unknown type 'linked_list'"),
        ({"io": {"params": [{"name": "a", "type": "node"}]}}, "io.params[0].type: unknown type"),
        ({"io": {"params": [{"name": "a"}], "inPlace": "b"}}, "io.inPlace 'b' is not one of"),
        (
            {"io": {"params": [{"name": "a", "type": "random_list"}], "returns": "graph_node"}},
            "random_list and graph_node both need a class named Node",
        ),
    ],
)
def test_bad_specs_are_rejected(spec: Any, message: str) -> None:
    with pytest.raises(harness.SpecError, match=re.escape(message)):
        harness.parse_spec(spec)


def test_a_bad_spec_fails_every_test_without_running_the_code() -> None:
    code = "print('ran')\n" + returning("1")
    results = run(code, [case([], 1, id="a"), case([], 1, id="b")], spec={"kind": "class"})
    assert results == [
        {
            "id": test_id,
            "status": "error",
            "error": "The problem's spec_json is invalid: unknown kind 'class' (expected "
            "'function' or 'design')\n",
            "stdout": "",
        }
        for test_id in ("a", "b")
    ]

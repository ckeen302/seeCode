"""Problem documents for the content-engine features: typed parameters (`io`), design
problems and checkers (docs/PARITY_PLAN.md 4.1-4.3).

Each is built from the fixture two-sum problem, so its text, approaches, signals and hints
are valid; only the code, viz, tests and the new fields change. Tests add them to the
fixture content with `with_engine_problems`; the shared fixture folder stays as it is.
"""

import copy
from typing import Any

from tests.conftest import fixture_documents

Document = dict[str, Any]


def _problem(
    slug: str,
    order: int,
    entry: str,
    starter: str,
    solution: str,
    tests: list[dict[str, Any]],
    primary: str,
    **fields: Any,
) -> Document:
    document: Document = copy.deepcopy(fixture_documents()["problems/two-sum.json"])
    document.update(
        slug=slug,
        title=slug.replace("-", " ").title(),
        leetcodeUrl=f"https://leetcode.com/problems/{slug}/",
        order=order,
        entry=entry,
        starterCode=starter,
        solution={"code": solution, "explanation": "A fixture.", "toolkit": []},
        viz={"primary": primary, "events": [{"id": "done", "at": "done", "label": "done"}]},
        tests=tests,
        related=[],
    )
    document.update(fields)
    return document


def _tests(*cases: tuple[list[Any], Any], **extra: Any) -> list[dict[str, Any]]:
    """Two visible tests, then hidden ones."""
    return [
        {
            "id": f"e{i + 1}" if i < 2 else f"h{i - 1}",
            "args": args,
            "expected": expected,
            "hidden": i >= 2,
            **extra,
        }
        for i, (args, expected) in enumerate(cases)
    ]


def _calls(*cases: tuple[list[Any], list[Any]], **extra: Any) -> list[dict[str, Any]]:
    return [
        {
            "id": f"e{i + 1}" if i < 2 else f"h{i - 1}",
            "ops": ops,
            "expected": expected,
            "hidden": i >= 2,
            **extra,
        }
        for i, (ops, expected) in enumerate(cases)
    ]


def _starter(signature: str) -> str:
    return f"class Solution:\n    {signature}\n        pass\n"


def reverse_linked_list() -> Document:
    signature = "def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:"
    return _problem(
        "reverse-linked-list",
        20,
        "reverseList",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        prev = None\n"
        "        while head:\n"
        "            head.next, prev, head = prev, head, head.next\n"
        "        return prev  # viz:done\n",
        _tests(
            ([[1, 2, 3]], [3, 2, 1]),
            ([[7]], [7]),
            ([[]], []),
            ([[5, 5, 1]], [1, 5, 5]),
            ([[1, 2]], [2, 1]),
        ),
        "head",
        io={"params": [{"name": "head", "type": "list_node"}], "returns": "list_node"},
    )


def invert_binary_tree() -> Document:
    signature = "def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:"
    return _problem(
        "invert-binary-tree",
        21,
        "invertTree",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        if root:\n"
        "            left = self.invertTree(root.left)\n"
        "            root.left = self.invertTree(root.right)\n"
        "            root.right = left\n"
        "        return root  # viz:done\n",
        _tests(
            ([[4, 2, 7, 1, 3, 6, 9]], [4, 7, 2, 9, 6, 3, 1]),
            ([[1, None, 2]], [1, 2]),
            ([[]], []),
            ([[1]], [1]),
            ([[1, 2, None, 3]], [1, None, 2, None, 3]),
        ),
        "root",
        io={"params": [{"name": "root", "type": "tree_node"}], "returns": "tree_node"},
    )


def copy_random_list() -> Document:
    signature = "def copyRandomList(self, head: 'Optional[Node]') -> 'Optional[Node]':"
    pairs = [[3, None], [1, 0], [2, 1]]
    return _problem(
        "copy-list-with-random-pointer",
        22,
        "copyRandomList",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        copies = {None: None}\n"
        "        node = head\n"
        "        while node:\n"
        "            copies[node] = Node(node.val)\n"
        "            node = node.next\n"
        "        for old, new in copies.items():\n"
        "            if old:\n"
        "                new.next = copies[old.next]\n"
        "                new.random = copies[old.random]\n"
        "        return copies[head]  # viz:done\n",
        _tests(
            ([pairs], pairs),
            ([[]], []),
            ([[[5, 0]]], [[5, 0]]),
            ([[[1, 2], [2, 2], [3, None]]], [[1, 2], [2, 2], [3, None]]),
            ([[[9, 1], [8, 0]]], [[9, 1], [8, 0]]),
        ),
        "head",
        io={"params": [{"name": "head", "type": "random_list"}], "returns": "random_list"},
    )


def clone_graph() -> Document:
    signature = "def cloneGraph(self, node: Optional['Node']) -> Optional['Node']:"
    square = [[2, 4], [1, 3], [2, 4], [1, 3]]
    return _problem(
        "clone-graph",
        23,
        "cloneGraph",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        copies = {}\n"
        "\n"
        "        def clone(old):\n"
        "            if old in copies:\n"
        "                return copies[old]\n"
        "            copies[old] = new = Node(old.val)\n"
        "            new.neighbors = [clone(n) for n in old.neighbors]\n"
        "            return new\n"
        "\n"
        "        return clone(node) if node else None  # viz:done\n",
        _tests(
            ([[[2, 3], [1, 3], [1, 2]]], [[2, 3], [1, 3], [1, 2]]),
            ([[[]]], [[]]),
            ([[]], []),
            ([[[2], [1]]], [[2], [1]]),
            ([square], square),
        ),
        "node",
        io={"params": [{"name": "node", "type": "graph_node"}], "returns": "graph_node"},
    )


def rotate_image() -> Document:
    signature = "def rotate(self, matrix: List[List[int]]) -> None:"
    return _problem(
        "rotate-image",
        24,
        "rotate",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        n = len(matrix)\n"
        "        for r in range(n):\n"
        "            for c in range(r + 1, n):\n"
        "                matrix[r][c], matrix[c][r] = matrix[c][r], matrix[r][c]\n"
        "        for row in matrix:\n"
        "            row.reverse()  # viz:done\n",
        _tests(
            ([[[1, 2], [3, 4]]], [[3, 1], [4, 2]]),
            ([[[7]]], [[7]]),
            ([[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[7, 4, 1], [8, 5, 2], [9, 6, 3]]),
            ([[[0, 0], [0, 1]]], [[0, 0], [1, 0]]),
            (
                [[[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]],
                [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]],
            ),
        ),
        "matrix",
        io={"params": [{"name": "matrix"}], "inPlace": "matrix"},
    )


def reorder_list() -> Document:
    signature = "def reorderList(self, head: Optional[ListNode]) -> None:"
    return _problem(
        "reorder-list",
        25,
        "reorderList",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        nodes = []\n"
        "        while head:\n"
        "            nodes.append(head)\n"
        "            head = head.next\n"
        "        l, r = 0, len(nodes) - 1\n"
        "        while l < r:\n"
        "            nodes[l].next = nodes[r]\n"
        "            l += 1\n"
        "            if l == r:\n"
        "                break\n"
        "            nodes[r].next = nodes[l]\n"
        "            r -= 1\n"
        "        if nodes:\n"
        "            nodes[l].next = None  # viz:done\n",
        _tests(
            ([[1, 2, 3, 4]], [1, 4, 2, 3]),
            ([[1, 2, 3, 4, 5]], [1, 5, 2, 4, 3]),
            ([[]], []),
            ([[1]], [1]),
            ([[1, 2]], [1, 2]),
        ),
        "nodes",
        io={"params": [{"name": "head", "type": "list_node"}], "inPlace": "head"},
    )


def merge_k_lists() -> Document:
    signature = "def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:"
    return _problem(
        "merge-k-sorted-lists",
        26,
        "mergeKLists",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        values = []\n"
        "        for node in lists:\n"
        "            while node:\n"
        "                values.append(node.val)\n"
        "                node = node.next\n"
        "        dummy = tail = ListNode()\n"
        "        for value in sorted(values):\n"
        "            tail.next = tail = ListNode(value)\n"
        "        return dummy.next  # viz:done\n",
        _tests(
            ([[[1, 4], [2, 3]]], [1, 2, 3, 4]),
            ([[]], []),
            ([[[]]], []),
            ([[[5], [1, 2], []]], [1, 2, 5]),
            ([[[0]]], [0]),
        ),
        "values",
        io={"params": [{"name": "lists", "type": "list_node[]"}], "returns": "list_node"},
    )


MIN_STACK_CODE = (
    "class MinStack:\n"
    "    def __init__(self):\n"
    "        self.stack = []\n"
    "\n"
    "    def push(self, val: int) -> None:\n"
    "        low = min(val, self.stack[-1][1]) if self.stack else val\n"
    "        self.stack.append((val, low))  # viz:done\n"
    "\n"
    "    def pop(self) -> None:\n"
    "        self.stack.pop()\n"
    "\n"
    "    def top(self) -> int:\n"
    "        return self.stack[-1][0]\n"
    "\n"
    "    def getMin(self) -> int:\n"
    "        return self.stack[-1][1]\n"
)
MIN_STACK_STARTER = (
    "class MinStack:\n"
    "    def __init__(self):\n"
    "        pass\n"
    "\n"
    "    def push(self, val: int) -> None:\n"
    "        pass\n"
    "\n"
    "    def pop(self) -> None:\n"
    "        pass\n"
    "\n"
    "    def top(self) -> int:\n"
    "        pass\n"
    "\n"
    "    def getMin(self) -> int:\n"
    "        pass\n"
)


def min_stack() -> Document:
    return _problem(
        "min-stack",
        27,
        "MinStack",
        MIN_STACK_STARTER,
        MIN_STACK_CODE,
        _calls(
            (
                [["MinStack"], ["push", 3], ["push", 1], ["getMin"], ["pop"], ["top"]],
                [None, None, None, 1, None, 3],
            ),
            ([["MinStack"], ["push", -4], ["getMin"]], [None, None, -4]),
            ([["MinStack"], ["push", 2], ["push", 2], ["pop"], ["getMin"]], [None] * 4 + [2]),
            ([["MinStack"], ["push", 0], ["top"]], [None, None, 0]),
            ([["MinStack"], ["push", 5], ["push", 6], ["getMin"]], [None, None, None, 5]),
        ),
        "val",
        kind="design",
    )


ANY_PAIR_CHECKER = (
    "def check(args, got):\n"
    "    nums, target = args\n"
    "    if not (isinstance(got, list) and len(got) == 2 and got[0] != got[1]):\n"
    "        return False\n"
    "    if not all(isinstance(i, int) and 0 <= i < len(nums) for i in got):\n"
    "        return False\n"
    "    return nums[got[0]] + nums[got[1]] == target\n"
)


def any_pair() -> Document:
    """Many right answers: any two positions whose values add up to target."""
    signature = "def anyPair(self, nums: List[int], target: int) -> List[int]:"
    return _problem(
        "any-pair",
        28,
        "anyPair",
        _starter(signature),
        "class Solution:\n"
        f"    {signature}\n"
        "        seen = {}\n"
        "        for i, x in enumerate(nums):\n"
        "            if target - x in seen:\n"
        "                return [seen[target - x], i]  # viz:done\n"
        "            seen[x] = i\n"
        "        return []\n",
        _tests(
            ([[1, 4, 2, 3], 5], [0, 1]),
            ([[2, 2, 2], 4], [0, 1]),
            ([[0, 0], 0], [0, 1]),
            ([[5, -5, 1, -1], 0], [0, 1]),
            ([[3, 9, 6, 0, 3], 9], [1, 3]),
            compare="checker",
        ),
        "nums",
        checker=ANY_PAIR_CHECKER,
    )


ROUND_TRIP_CHECKER = (
    "def check(args, got):\n"
    "    strs = args[1][1]\n"
    "    return isinstance(got[1], str) and got[2] == strs\n"
)


def encode_decode() -> Document:
    """A design round trip: decode gets what encode returned ({"$ref": 1})."""
    code = (
        "class Solution:\n"
        "    def encode(self, strs: List[str]) -> str:\n"
        "        return ''.join(f'{len(s)}#{s}' for s in strs)  # viz:done\n"
        "\n"
        "    def decode(self, s: str) -> List[str]:\n"
        "        out, i = [], 0\n"
        "        while i < len(s):\n"
        "            j = s.index('#', i)\n"
        "            size = int(s[i:j])\n"
        "            out.append(s[j + 1 : j + 1 + size])\n"
        "            i = j + 1 + size\n"
        "        return out\n"
    )
    starter = (
        "class Solution:\n"
        "    def encode(self, strs: List[str]) -> str:\n"
        "        pass\n"
        "\n"
        "    def decode(self, s: str) -> List[str]:\n"
        "        pass\n"
    )

    def trip(strs: list[str]) -> tuple[list[Any], list[Any]]:
        return [["Solution"], ["encode", strs], ["decode", {"$ref": 1}]], [None, None, strs]

    return _problem(
        "encode-and-decode-strings",
        29,
        "Solution",
        starter,
        code,
        _calls(
            trip(["see", "code"]),
            trip([]),
            trip(["", "#", "3#x"]),
            trip(["12 apples"]),
            trip(["a" * 30, "b"]),
            compare="checker",
        ),
        "strs",
        kind="design",
        checker=ROUND_TRIP_CHECKER,
    )


ENGINE_PROBLEMS = (
    reverse_linked_list,
    invert_binary_tree,
    copy_random_list,
    clone_graph,
    rotate_image,
    reorder_list,
    merge_k_lists,
    min_stack,
    any_pair,
    encode_decode,
)


def file_name(document: Document) -> str:
    return f"problems/{document['slug']}.json"


def with_engine_problems(documents: dict[str, Any]) -> dict[str, Any]:
    """`documents` plus every engine problem (a new dict)."""
    added = [build() for build in ENGINE_PROBLEMS]
    return {**documents, **{file_name(document): document for document in added}}

"""Drill card selection (Section 11.7), pure: weights, the recognition draw and its
constraints over many fixed seeds, the pattern filter split, and toolkit cards.

M5 acceptance: a 10-card recognition session never shows the same pattern three times in
a row and never repeats a problem.
"""

import itertools
from collections import Counter
from functools import cache
from random import Random

import pytest

from app.learning.drills import (
    Candidate,
    arrange,
    choose_cards,
    filter_share,
    longest_run,
    max_share,
    miss_rate,
    problem_weight,
    select_recognition,
    select_toolkit,
    tool_matches,
    toolkit_options,
    toolkit_weight,
    weakness,
)

PATTERNS = ["hashing", "two_pointers_opposite", "stack", "sliding_window", "binary_search"]
SEEDS = range(200)


def pool(patterns: list[str] = PATTERNS, per_pattern: int = 9, seed: int = 0) -> list[Candidate]:
    """`per_pattern` problems per pattern with varied weights (as the formula gives)."""
    rng = Random(seed)
    weights = [0.2, 1.0, 1.2, 2.0, 3.0, 4.0]
    return [
        Candidate(f"{pattern}-{n}", pattern, rng.choice(weights))
        for pattern in patterns
        for n in range(per_pattern)
    ]


def check_session(cards: list[Candidate], size: int) -> None:
    assert len(cards) == size
    assert len({card.key for card in cards}) == size, "a problem came twice"
    assert longest_run(card.group for card in cards) <= 2, [c.group for c in cards]


# ---------------------------------------------------------------- weights


def test_weakness_uses_the_last_20_answers() -> None:
    assert weakness([]) == 0.5
    assert weakness([True, False]) == 0.5  # fewer than 3 answers
    assert weakness([True, False, False]) == pytest.approx(2 / 3)
    assert weakness([True] * 3) == 0.0
    # Only the newest 20 count (newest first).
    assert weakness([True] * 20 + [False] * 10) == 0.0
    assert weakness([False] * 5 + [True] * 15 + [False] * 10) == pytest.approx(0.25)


def test_problem_weight_follows_the_formula() -> None:
    assert problem_weight(0.5, never_drilled=True, drilled_recently=False) == 3.0
    assert problem_weight(0.0, never_drilled=False, drilled_recently=False) == 1.0
    assert problem_weight(1.0, never_drilled=False, drilled_recently=False) == 3.0
    assert problem_weight(0.0, never_drilled=False, drilled_recently=True) == pytest.approx(0.2)
    assert problem_weight(0.25, never_drilled=False, drilled_recently=True) == pytest.approx(0.7)
    assert problem_weight(-1.0, never_drilled=False, drilled_recently=True) == 0.1  # floor


def test_toolkit_miss_rate_is_smoothed() -> None:
    assert miss_rate([]) == 0.5
    assert miss_rate([False]) == pytest.approx(2 / 3)
    assert miss_rate([True]) == pytest.approx(1 / 3)
    assert miss_rate([True] * 20 + [False] * 20) == pytest.approx(1 / 22)  # last 20 only
    assert toolkit_weight(0.5) == 2.0


def test_shares() -> None:
    assert [max_share(n) for n in (1, 2, 3, 4, 5, 10, 20, 30)] == [1, 2, 2, 3, 4, 7, 14, 20]
    assert [filter_share(n) for n in (1, 2, 3, 5, 10, 20, 30)] == [1, 1, 2, 4, 7, 14, 21]


def test_longest_run() -> None:
    assert longest_run([]) == 0
    assert longest_run(["a", "a", "b", "a", "a", "a", "b"]) == 3
    assert longest_run(["a", "b", "a"]) == 1


# ---------------------------------------------------------------- the recognition draw


@pytest.mark.parametrize("size", [1, 2, 3, 5, 10, 20, 30])
def test_sessions_never_repeat_a_problem_or_run_a_pattern_three_times(size: int) -> None:
    candidates = pool()
    for seed in SEEDS:
        check_session(select_recognition(candidates, size, Random(seed)), size)


@pytest.mark.parametrize("pattern_count", [2, 3, 4, 5])
def test_ten_card_sessions_hold_the_rules_for_any_unlocked_set(pattern_count: int) -> None:
    """M5 acceptance, across pools of 2-5 unlocked patterns and skewed weights."""
    for seed in SEEDS:
        candidates = pool(PATTERNS[:pattern_count], seed=seed)
        check_session(select_recognition(candidates, 10, Random(seed)), 10)


def test_one_heavy_pattern_still_spreads_out() -> None:
    heavy = [Candidate(f"h{n}", "hashing", 50.0) for n in range(20)]
    light = [Candidate(f"s{n}", "stack", 0.1) for n in range(20)]
    for seed in SEEDS:
        cards = select_recognition(heavy + light, 10, Random(seed))
        check_session(cards, 10)
        assert Counter(card.group for card in cards)["hashing"] == max_share(10)


def test_the_same_seed_deals_the_same_session() -> None:
    candidates = pool()
    first = select_recognition(candidates, 10, Random(42))
    assert select_recognition(candidates, 10, Random(42)) == first
    assert select_recognition(candidates, 10, Random(43)) != first


def test_weights_decide_which_problems_come_and_come_first() -> None:
    favored = [Candidate(f"f{n}", PATTERNS[n % 5], 10.0) for n in range(10)]
    others = [Candidate(f"o{n}", PATTERNS[n % 5], 0.1) for n in range(35)]
    picked = Counter()
    first = Counter()
    for seed in SEEDS:
        cards = select_recognition(favored + others, 10, Random(seed))
        picked.update(card.key.startswith("f") for card in cards)
        first[cards[0].key.startswith("f")] += 1
    assert picked[True] > 0.85 * picked.total()
    assert first[True] > 0.9 * len(SEEDS)


def test_a_session_is_never_longer_than_the_pool() -> None:
    small = pool(["hashing", "stack"], per_pattern=3)
    for seed in SEEDS:
        check_session(select_recognition(small, 10, Random(seed)), 6)
    assert select_recognition([], 10, Random(0)) == []


def test_a_single_unlocked_pattern_still_fills_the_session() -> None:
    """A new user has only the first pattern: the run rule cannot hold, the session still
    gets its cards (each problem once)."""
    only = pool(["hashing"])
    for seed in range(20):
        cards = select_recognition(only, 10, Random(seed))
        assert len(cards) == 9
        assert len({card.key for card in cards}) == 9


def test_a_lone_other_card_splits_the_longest_run() -> None:
    lopsided = [Candidate(f"h{n}", "hashing", 1.0) for n in range(9)] + [
        Candidate("s0", "stack", 0.1)
    ]
    for seed in range(20):
        groups = [card.group for card in select_recognition(lopsided, 10, Random(seed))]
        # The stack card comes right after the first two hashing cards: the fewest cards
        # possible (5) break the rule.
        assert groups[:3] == ["hashing", "hashing", "stack"]


@pytest.mark.parametrize(("size", "mine"), [(1, 1), (3, 2), (5, 4), (10, 7)])
def test_a_pattern_filter_takes_70_percent(size: int, mine: int) -> None:
    candidates = pool()
    for seed in SEEDS:
        cards = select_recognition(candidates, size, Random(seed), "stack")
        check_session(cards, size)
        assert Counter(card.group for card in cards)["stack"] == mine


@pytest.mark.parametrize("size", [20, 30])
def test_a_filtered_pattern_gives_all_it_has_and_the_others_fill_up(size: int) -> None:
    """Each v1 pattern has 9 problems, fewer than 70% of 20 or 30 cards."""
    candidates = pool()
    for seed in range(50):
        cards = select_recognition(candidates, size, Random(seed), "binary_search")
        check_session(cards, size)
        assert Counter(card.group for card in cards)["binary_search"] == 9


def test_the_filter_share_never_breaks_the_run_rule() -> None:
    """70% of 30 is 21, but 30 cards spread out hold at most 20 of one pattern."""
    big = [Candidate(f"s{n}", "stack", 1.0) for n in range(30)]
    rest = [Candidate(f"h{n}", "hashing", 1.0) for n in range(30)]
    for seed in range(50):
        cards = select_recognition(big + rest, 30, Random(seed), "stack")
        check_session(cards, 30)
        assert Counter(card.group for card in cards)["stack"] == 20


def test_a_filter_with_few_other_problems_fills_with_the_pattern() -> None:
    mine = [Candidate(f"s{n}", "stack", 1.0) for n in range(9)]
    other = [Candidate("h0", "hashing", 1.0)]
    for seed in range(20):
        cards = select_recognition(mine + other, 10, Random(seed), "stack")
        assert len(cards) == 10
        assert Counter(card.group for card in cards) == {"stack": 9, "hashing": 1}


def test_choose_cards_ignores_duplicate_keys() -> None:
    doubled = pool(["hashing", "stack"], per_pattern=2) * 2
    for seed in range(20):
        assert len(choose_cards(doubled, 10, Random(seed))) == 4


@cache
def _placeable(counts: tuple[int, ...], last: int, run: int) -> bool:
    """Brute force: can these group counts follow `run` cards of group `last` with no
    group three times in a row?"""
    if not any(counts):
        return True
    for group, count in enumerate(counts):
        if count == 0 or (group == last and run == 2):
            continue
        rest = list(counts)
        rest[group] -= 1
        if _placeable(tuple(rest), group, run + 1 if group == last else 1):
            return True
    return False


def test_arrange_spreads_every_multiset_that_can_be_spread() -> None:
    """`arrange` keeps the run rule exactly when an arrangement exists (brute force)."""
    for counts in itertools.product(range(6), repeat=3):
        cards = [
            Candidate(f"{group}-{n}", str(group), 1.0 + n)
            for group, count in enumerate(counts)
            for n in range(count)
        ]
        possible = _placeable(counts, -1, 0)
        for seed in range(3):
            order = arrange(cards, Random(seed))
            assert sorted(c.key for c in order) == sorted(c.key for c in cards)
            if possible:
                assert longest_run(c.group for c in order) <= 2, counts
        assert possible == (max(counts) <= max_share(sum(counts)))


# ---------------------------------------------------------------- toolkit cards


def test_toolkit_due_cards_come_first() -> None:
    candidates = [Candidate(key, key, 1.0) for key in "abcdefgh"]
    for seed in range(20):
        chosen = select_toolkit(["g", "c"], candidates, 5, Random(seed))
        assert chosen[:2] == ["g", "c"]
        assert len(chosen) == len(set(chosen)) == 5
    assert select_toolkit(["g", "c", "a"], candidates, 2, Random(0)) == ["g", "c"]
    assert sorted(select_toolkit([], candidates, 20, Random(0))) == list("abcdefgh")


def test_toolkit_cards_missed_more_come_more_often() -> None:
    candidates = [Candidate("missed", "missed", toolkit_weight(0.9))] + [
        Candidate(f"k{n}", f"k{n}", toolkit_weight(0.05)) for n in range(20)
    ]
    hits = sum("missed" in select_toolkit([], candidates, 3, Random(s)) for s in SEEDS)
    # 3 of 21 cards: about 0.14 if weights did nothing, about 0.31 with them.
    assert hits > 0.22 * len(SEEDS)


def test_toolkit_options_hold_the_tool_and_three_others() -> None:
    tools = [f"tool{n}()" for n in range(10)]
    for seed in range(50):
        options = toolkit_options("tool3()", tools, Random(seed))
        assert len(options) == len(set(options)) == 4
        assert "tool3()" in options
        assert set(options) <= set(tools)
    positions = {toolkit_options("tool3()", tools, Random(s)).index("tool3()") for s in range(50)}
    assert positions == {0, 1, 2, 3}  # shuffled
    assert sorted(toolkit_options("a", ["a", "b"], Random(0))) == ["a", "b"]


@pytest.mark.parametrize(
    ("answer", "right"),
    [
        (".lower()", True),
        ("  .LOWER ( )", True),
        ("lower()", True),
        ("lower", True),  # the card id
        (".upper()", False),
        ("", False),
        ("   ", False),
    ],
)
def test_tool_matches(answer: str, right: bool) -> None:
    assert tool_matches(answer, ".lower()", "lower") is right


def test_tool_matches_multi_part_tools() -> None:
    assert tool_matches("Counter.most_common(k)", "Counter.most_common(k)", "most_common")
    assert tool_matches("most_common", "Counter.most_common(k)", "most_common")
    assert tool_matches("counter", "Counter", "counter")
    assert not tool_matches("Counter", "Counter.most_common(k)", "most_common")

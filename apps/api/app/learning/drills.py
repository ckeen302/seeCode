"""Drills (Section 11.7): the recognition draw, the toolkit draw and toolkit grading. Pure.

**Recognition.** The pool is every problem, Workspace or drill-only, whose pattern is
unlocked for the user. Each problem is weighted

    w = 1 + 2 * weakness(pattern) + (1 if never drilled) - (0.8 if drilled in the last 24 h)

floored at 0.1, where weakness = 1 - accuracy of the user's last 20 drill answers in the
pattern (0.5 with fewer than 3). Cards are drawn by weight without replacement: never the
same problem twice, never one pattern three times in a row, and with a pattern filter
70% of the cards from that pattern and the rest from the others.

The draw has two steps:

1. Choose the cards. n cards can be spread with at most two of a pattern in a row exactly
   when no pattern holds more than (2n + 2) // 3 of them, so the draw caps every pattern
   there. With a filter the split is fixed first: round(0.7 n) from the pattern (within
   that cap and what the pattern has), the rest from the others; when the others run
   short, the filtered pattern fills the session.
2. Order them. At each step the next card is drawn by weight among those whose pattern
   would not make three in a row; a pattern holding more than two thirds of the cards
   left must go next. That keeps the rest placeable (see `arrange`), so the earliest
   cards are the most important ones and the run rule always holds.

Only a pool that cannot be spread at all (one unlocked pattern, so every card shares it)
repeats a pattern three times in a row; the session still gets its cards, as interleaved
as the pool allows.

**Toolkit.** Cards due for review come first (oldest due first), then cards tagged with
an unlocked pattern, drawn by weight 1 + 2 * missRate without replacement. Untagged cards
(`cache`) are always eligible, so every card can appear. missRate is the share of misses
in the user's last 20 answers on the card, smoothed toward 0.5: (misses + 1) /
(answers + 2). Each card shows one of its phrases and four options: its tool and three
other cards' tools, shuffled.
"""

from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from random import Random
from typing import Final

RECENT_ANSWERS = 20  # weakness and miss rate use the user's last 20 answers
MIN_ANSWERS = 3  # fewer answers than this: weakness 0.5
DEFAULT_WEAKNESS = 0.5
NEVER_DRILLED_BONUS = 1.0
RECENTLY_DRILLED_PENALTY = 0.8
RECENT_HOURS = 24
MIN_WEIGHT = 0.1
MAX_RUN = 2  # a pattern may appear at most twice in a row
OPTIONS = 4  # toolkit cards: the right tool and three distractors

RECOGNITION: Final = "recognition"
TOOLKIT: Final = "toolkit"


# ---------------------------------------------------------------- weights


def weakness(recent: Sequence[bool]) -> float:
    """1 - accuracy of the newest `RECENT_ANSWERS` results (`recent` is newest first)."""
    results = list(recent[:RECENT_ANSWERS])
    if len(results) < MIN_ANSWERS:
        return DEFAULT_WEAKNESS
    return 1.0 - sum(results) / len(results)


def problem_weight(pattern_weakness: float, never_drilled: bool, drilled_recently: bool) -> float:
    weight = 1.0 + 2.0 * pattern_weakness
    if never_drilled:
        weight += NEVER_DRILLED_BONUS
    if drilled_recently:
        weight -= RECENTLY_DRILLED_PENALTY
    return max(MIN_WEIGHT, weight)


def miss_rate(recent: Sequence[bool]) -> float:
    """Smoothed share of misses in the newest results (`recent` is newest first)."""
    results = list(recent[:RECENT_ANSWERS])
    misses = sum(not correct for correct in results)
    return (misses + 1) / (len(results) + 2)


def toolkit_weight(card_miss_rate: float) -> float:
    return 1.0 + 2.0 * card_miss_rate


# ---------------------------------------------------------------- the recognition draw


@dataclass(frozen=True, slots=True)
class Candidate:
    key: str  # problem slug (recognition) or toolkit id
    group: str  # the problem's pattern; the run rule never mixes groups
    weight: float


def max_share(size: int) -> int:
    """The most cards one pattern may hold so `size` cards can avoid three in a row."""
    return (2 * size + 2) // 3


def filter_share(size: int) -> int:
    """70% of `size`, rounded half up (Section 11.7)."""
    return (7 * size + 5) // 10


def weighted_choice[T](items: Sequence[T], weight: Callable[[T], float], rng: Random) -> T:
    """One item, with probability proportional to its weight (in `items` order)."""
    if not items:
        raise ValueError("nothing to choose from")
    total = sum(weight(item) for item in items)
    point = rng.random() * total
    for item in items:
        point -= weight(item)
        if point < 0:
            return item
    return items[-1]


def _by_weight(candidate: Candidate) -> float:
    return candidate.weight


def _draw(
    candidates: Sequence[Candidate], count: int, rng: Random, cap: int | None = None
) -> list[Candidate]:
    """`count` candidates by weight without replacement, at most `cap` per group while
    other groups still have candidates."""
    left = list(candidates)
    taken: list[Candidate] = []
    per_group: Counter[str] = Counter()
    while len(taken) < count and left:
        room = [c for c in left if cap is None or per_group[c.group] < cap] or left
        pick = weighted_choice(room, _by_weight, rng)
        taken.append(pick)
        left.remove(pick)
        per_group[pick.group] += 1
    return taken


def choose_cards(
    pool: Sequence[Candidate], size: int, rng: Random, pattern_filter: str | None = None
) -> list[Candidate]:
    """Which problems the session gets (step 1); `arrange` orders them."""
    unique = list({candidate.key: candidate for candidate in pool}.values())
    count = min(size, len(unique))
    if count <= 0:
        return []
    cap = max_share(count)
    if pattern_filter is None:
        return _draw(unique, count, rng, cap)
    mine = [c for c in unique if c.group == pattern_filter]
    others = [c for c in unique if c.group != pattern_filter]
    from_mine = min(filter_share(count), len(mine), cap)
    from_others = min(count - from_mine, len(others))
    from_mine = min(len(mine), count - from_others)  # the others ran short: fill up
    return _draw(mine, from_mine, rng) + _draw(others, from_others, rng, cap)


def _blocked(order: Sequence[Candidate]) -> str | None:
    """The group the next card may not have: the last two cards' group, when they match."""
    if len(order) >= MAX_RUN and len({card.group for card in order[-MAX_RUN:]}) == 1:
        return order[-1].group
    return None


def arrange(cards: Sequence[Candidate], rng: Random) -> list[Candidate]:
    """Order `cards` so no group appears three times in a row (step 2).

    With r cards left, a group holding y of them can still be placed exactly when
    y <= 2 (r - y) + 2 - k, where k is how many of the last cards placed belong to it
    (the other cards split the rest into r - y + 1 gaps of at most two). A group with
    3 y > 2 r is the only one that can break this on the next step, and it is never the
    blocked group while the cards can be placed, so it goes next; otherwise any card that
    keeps the run rule may follow. Cards that cannot be spread at all (one group left
    after two of it) break the rule as rarely as possible.
    """
    left = list(cards)
    order: list[Candidate] = []
    while left:
        blocked = _blocked(order)
        allowed = [card for card in left if card.group != blocked] or left
        counts = Counter(card.group for card in left)
        crowded = [g for g, k in counts.items() if 3 * k > 2 * len(left) and g != blocked]
        if crowded:
            allowed = [card for card in allowed if card.group == crowded[0]]
        pick = weighted_choice(allowed, _by_weight, rng)
        order.append(pick)
        left.remove(pick)
    return order


def select_recognition(
    pool: Sequence[Candidate], size: int, rng: Random, pattern_filter: str | None = None
) -> list[Candidate]:
    """The cards of a recognition session, in the order they are shown."""
    return arrange(choose_cards(pool, size, rng, pattern_filter), rng)


def longest_run(groups: Iterable[str]) -> int:
    """The longest run of one group in a row (0 for no cards)."""
    longest = run = 0
    previous: str | None = None
    for group in groups:
        run = run + 1 if group == previous else 1
        previous = group
        longest = max(longest, run)
    return longest


# ---------------------------------------------------------------- the toolkit draw


def select_toolkit(
    due: Sequence[str], candidates: Sequence[Candidate], size: int, rng: Random
) -> list[str]:
    """Toolkit ids for a session: due cards first (in `due` order), then by weight."""
    chosen = list(dict.fromkeys(due))[: max(size, 0)]
    taken = set(chosen)
    left = [c for c in {c.key: c for c in candidates}.values() if c.key not in taken]
    while len(chosen) < size and left:
        pick = weighted_choice(left, _by_weight, rng)
        chosen.append(pick.key)
        left.remove(pick)
    return chosen


def toolkit_options(tool: str, other_tools: Iterable[str], rng: Random) -> list[str]:
    """The card's tool and up to three other tools, shuffled."""
    distractors = sorted(set(other_tools) - {tool})
    options = [tool, *rng.sample(distractors, min(OPTIONS - 1, len(distractors)))]
    rng.shuffle(options)
    return options


def _normalized_tool(text: str) -> str:
    return "".join(text.split()).casefold().lstrip(".")


def tool_matches(answer: str, tool: str, toolkit_id: str) -> bool:
    """A typed or picked tool is right when it is the card's tool or its id, ignoring
    case, spaces and a leading dot (".lower()", "lower()", "LOWER" for `lower`)."""
    given = _normalized_tool(answer)
    return bool(given) and given in {_normalized_tool(tool), _normalized_tool(toolkit_id)}

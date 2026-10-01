"""Stats helpers (Sections 1.6, 6.8 and 11.8): medians, rung histograms, weeks and the
plan misses behind "Your common misses". Pure.

Plan time (the north-star metric, 1.6) is measured in drills and first attempts: the
seconds of each correct recognition drill answer, and the active seconds at the first
correct plan check of the user's first attempt of a problem (the earliest attempt that
was not abandoned).
"""

import statistics
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, timedelta
from typing import Any, Literal

from app.learning.outcomes import MAX_RUNG

MissKind = Literal["structure", "time", "space"]
MISS_KINDS: tuple[MissKind, ...] = ("structure", "time", "space")
TOP_MISSES = 5
STATS_WEEKS = 8
SECONDS_DECIMALS = 1


def median_or_none(values: Iterable[float]) -> float | None:
    data = list(values)
    if not data:
        return None
    return round(float(statistics.median(data)), SECONDS_DECIMALS)


def accuracy(results: Sequence[bool]) -> float | None:
    """Share of True results, rounded to 4 decimals; None without results."""
    if not results:
        return None
    return round(sum(results) / len(results), 4)


def rung_histogram(rungs: Iterable[int]) -> list[int]:
    """How many attempts reached each max rung, 0 through 6."""
    counts = [0] * (MAX_RUNG + 1)
    for rung in rungs:
        counts[min(max(rung, 0), MAX_RUNG)] += 1
    return counts


def week_starts(this_week: date, weeks: int = STATS_WEEKS) -> list[date]:
    """The Mondays of the last `weeks` weeks, oldest first, ending with `this_week`."""
    return [this_week - timedelta(weeks=back) for back in range(weeks - 1, -1, -1)]


def plan_misses(
    grade: Mapping[str, Any], time_target: str | None, space_target: str | None
) -> list[tuple[MissKind, str]]:
    """What a graded plan missed: the chosen approach's structures the plan left out,
    and its time or space target when the plan got that field wrong.

    `grade` is a stored PlanGrade (camelCase JSON); the targets are the chosen approach's
    (None when it no longer exists). `missing` is only stored once the plan is revealed.
    """
    fields = grade.get("fields") or {}
    structures = fields.get("structures") or {}
    misses: list[tuple[MissKind, str]] = []
    misses.extend(("structure", str(structure)) for structure in structures.get("missing") or [])
    time_result = (fields.get("time") or {}).get("result")
    if time_target is not None and time_result not in (None, "correct"):
        misses.append(("time", time_target))
    space_result = (fields.get("space") or {}).get("result")
    if space_target is not None and space_result not in (None, "correct"):
        misses.append(("space", space_target))
    return misses


def top_misses(
    counts: Counter[tuple[MissKind, str]], limit: int = TOP_MISSES
) -> list[tuple[MissKind, str, int]]:
    """The most frequent misses, most first (ties: structures, then time, then space)."""
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], MISS_KINDS.index(kv[0][0]), kv[0][1]))
    return [(kind, value, count) for (kind, value), count in ranked[:limit]]

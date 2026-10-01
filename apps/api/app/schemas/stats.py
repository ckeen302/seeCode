"""`StatsView` (Section 6.8). Section 16.2 names the type without fields.

- `patterns`: per pattern in roadmap order: state, solved / mastered / total Workspace
  problems, the median max rung of first attempts, and drill accuracy over the pattern's
  last 30 recognition answers.
- `weeks`: the last 8 weeks (Monday to Sunday in the user's time zone), oldest first:
  active days, problems solved, drill answers, reviews (and how many were remembered),
  the median plan time, and the max-rung histogram (rungs 0-6) of first attempts that
  finished that week.
- `commonMisses`: the top 5 structures or complexity targets missed in plans (drills,
  reviews and Workspace plan checks) over those 8 weeks.
- `reviewRetention`: the share of the last 30 reviews not graded `again`.
"""

from datetime import date
from typing import Literal

from app.learning.mastery import PatternState
from app.schemas import CamelModel


class PatternStats(CamelModel):
    pattern_id: str
    pattern_name: str
    state: PatternState
    solved: int
    mastered: int
    total: int
    median_first_rung: float | None
    drill_accuracy: float | None
    drill_answers: int  # how many answers drillAccuracy is over (at most 30)


class WeekStatsRow(CamelModel):
    week_start: date
    active_days: int
    solved: int
    drills: int
    reviews: int
    remembered: int
    median_plan_seconds: float | None
    first_attempt_rungs: list[int]  # 7 counts: max rung 0 through 6


class CommonMiss(CamelModel):
    kind: Literal["structure", "time", "space"]
    id: str  # structure id, or the missed complexity
    label: str  # "Hash map (dict)", "O(n) time"
    count: int


class ReviewRetention(CamelModel):
    reviews: int
    remembered: int
    rate: float | None


class StatsTotals(CamelModel):
    solved: int
    mastered: int
    problems: int
    drills: int
    reviews: int
    active_days: int


class StatsView(CamelModel):
    streak: int
    longest_streak: int
    totals: StatsTotals
    patterns: list[PatternStats]
    weeks: list[WeekStatsRow]
    common_misses: list[CommonMiss]
    review_retention: ReviewRetention

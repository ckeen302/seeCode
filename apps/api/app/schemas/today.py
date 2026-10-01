"""`TodayView` (Sections 6.2, 11.8 and 16.3).

Beyond 16.3: `continue.lastActiveAt` (for "Last time: …") and `start`, the single
"Start with your first pattern" card a brand-new user sees instead of the others.
"""

from datetime import datetime

from pydantic import Field

from app.content.models import Difficulty
from app.schemas import CamelModel


class ContinueCard(CamelModel):
    """The roadmap card. `patternId` is null for an attempt in progress on a problem the
    user has not solved yet (its pattern would spoil recognition); `lastActiveAt` is the
    attempt's last activity, null for the next roadmap problem."""

    slug: str
    title: str
    difficulty: Difficulty
    pattern_id: str | None
    in_progress: bool
    last_active_at: datetime | None


class DrillSuggestion(CamelModel):
    pattern_id: str
    pattern_name: str
    reason: str


class WeekStats(CamelModel):
    """The last 7 calendar days in the user's time zone, today included: problems solved,
    drill answers, reviews, and the median plan time (Section 1.6) in seconds."""

    solved: int
    drills: int
    reviews: int
    median_plan_seconds: float | None


class StartCard(CamelModel):
    pattern_id: str
    pattern_name: str


class TodayView(CamelModel):
    greeting_name: str  # the display name's first word; "" when the profile has no name
    streak: int
    reviews_due: int
    review_patterns: list[str]  # patterns of the due problem items, oldest due first
    continue_: ContinueCard | None = Field(alias="continue")
    drill: DrillSuggestion | None
    week: WeekStats
    start: StartCard | None  # set only for a brand-new user (no attempts, no drills)

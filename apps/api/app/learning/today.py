"""Today (Sections 6.2 and 11.8): the weakest pattern for the 5-minute drill. Pure.

The drill card names one unlocked pattern (so its link always starts a valid session):

1. the unlocked pattern with the highest weakness over its last 20 drill answers, among
   patterns with at least 3 answers, when that weakness is above 0 (ties go to roadmap
   order);
2. else the pattern of the most recent attempt with maxRung >= 3, among unlocked patterns;
3. else the unlocked pattern with the fewest drill answers (Section 6.2 shows the card
   whenever a pattern is unlocked).

Each pick carries a one-line reason for the card.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.learning.drills import MIN_ANSWERS, RECENT_ANSWERS, weakness

HINT_RUNG = 3  # maxRung >= 3: the attempt needed the approach rung or more
HINT_HISTORY = 5  # the reason counts the pattern's last 5 problems


@dataclass(frozen=True, slots=True)
class AttemptFact:
    """What Today needs from one attempt that was not abandoned."""

    slug: str
    pattern_id: str
    max_rung: int
    started_at: datetime


@dataclass(frozen=True, slots=True)
class DrillPick:
    pattern_id: str
    reason: str


def _count(number: int, noun: str) -> str:
    return f"{number} {noun}" if number == 1 else f"{number} {noun}s"


def weak_pattern(
    unlocked: Sequence[str],
    recent_drills: Mapping[str, Sequence[bool]],
    drill_counts: Mapping[str, int],
    attempts: Sequence[AttemptFact],
) -> DrillPick | None:
    """The 5-minute drill's pattern and reason.

    `unlocked` is in roadmap order; `recent_drills` holds each pattern's drill results,
    newest first; `drill_counts` counts all of a pattern's drill answers; `attempts` are
    the user's attempts that were not abandoned, newest first.
    """
    if not unlocked:
        return None

    scored = [
        (weakness(recent_drills[p]), -rank, p)
        for rank, p in enumerate(unlocked)
        if len(recent_drills.get(p, ())) >= MIN_ANSWERS
    ]
    if scored:
        worst, _, pattern_id = max(scored)
        if worst > 0:
            recent = list(recent_drills[pattern_id][:RECENT_ANSWERS])
            right = sum(recent)
            return DrillPick(
                pattern_id,
                f"You got {right} of your last {len(recent)} drills in this pattern right.",
            )

    allowed = set(unlocked)
    hinted = next(
        (a for a in attempts if a.max_rung >= HINT_RUNG and a.pattern_id in allowed), None
    )
    if hinted is not None:
        latest: dict[str, AttemptFact] = {}
        for attempt in attempts:
            if attempt.pattern_id == hinted.pattern_id and attempt.slug not in latest:
                latest[attempt.slug] = attempt
        last = list(latest.values())[:HINT_HISTORY]
        helped = sum(a.max_rung >= HINT_RUNG for a in last)
        if len(last) == 1:
            reason = "You needed hints on your last problem in this pattern."
        else:
            reason = (
                f"You needed hints on {helped} of your last {len(last)} problems in this pattern."
            )
        return DrillPick(hinted.pattern_id, reason)

    fewest = min(unlocked, key=lambda p: (drill_counts.get(p, 0), unlocked.index(p)))
    done = drill_counts.get(fewest, 0)
    if done == 0:
        reason = "You haven't drilled this pattern yet."
    elif done < MIN_ANSWERS:
        reason = f"You've done {_count(done, 'drill')} in this pattern so far."
    else:
        reason = "Keep this pattern fresh with a quick drill."
    return DrillPick(fewest, reason)


def greeting_name(display_name: str | None) -> str:
    """The first name to greet the user with ("" when the profile has no name)."""
    words = (display_name or "").split()
    return words[0] if words else ""

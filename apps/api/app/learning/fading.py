"""Worked-example fading in the Workspace (Section 11.6). Pure.

On the user's first attempt of a problem:

- the first problem of its pattern (lowest `order`) gets the pattern pre-filled ("Given"),
  and rungs 1 and 2 open from the start without counting toward maxRung;
- the second problem gets rung 1 free: opening it does not count toward maxRung;
- later problems get no support.

"First attempt" means the user has not finished an attempt of this problem yet, so
"Start over" and attempts abandoned after 14 idle days keep the support.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field

GIVEN_RUNGS = (1, 2)  # first problem of a pattern: open from the start, free
SECOND_PROBLEM_FREE_RUNGS = (1,)


@dataclass(frozen=True, slots=True)
class Fading:
    given_pattern: str | None = None
    free_rungs: tuple[int, ...] = ()
    open_rungs: tuple[int, ...] = field(default=())  # rungs opened when the attempt starts


NO_FADING = Fading()


def fading_for(
    slug: str, pattern_id: str, pattern_slugs: Sequence[str], first_attempt: bool
) -> Fading:
    """`pattern_slugs` lists the pattern's Workspace problems by `order`."""
    if not first_attempt or slug not in pattern_slugs:
        return NO_FADING
    position = pattern_slugs.index(slug)
    if position == 0:
        return Fading(given_pattern=pattern_id, free_rungs=GIVEN_RUNGS, open_rungs=GIVEN_RUNGS)
    if position == 1:
        return Fading(free_rungs=SECOND_PROBLEM_FREE_RUNGS)
    return NO_FADING


def given_pattern(pattern_id: str, free_rungs: Sequence[int]) -> str | None:
    """The pre-filled pattern of a stored attempt: only first-problem fading frees rung 2."""
    return pattern_id if set(GIVEN_RUNGS) <= set(free_rungs) else None

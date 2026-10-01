"""Guest mode bodies (Section 16.2). Guests keep their attempts in localStorage
(`seecode:guest:attempts`); `POST /guest/import` uploads them after sign-in."""

from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, Field

from app.learning.outcomes import MAX_RUNG
from app.learning.plan_grading import MAX_PLAN_CHECKS
from app.schemas import CamelModel
from app.schemas.attempts import MAX_ID_CHARS, Code
from app.schemas.plan import PlanCard, PlanGrade

MAX_GUEST_ATTEMPTS = 50
MAX_GUEST_ACTIVE_SECONDS = 7 * 24 * 60 * 60


class GuestPlanCheck(CamelModel):
    plan: PlanCard
    check_number: int = Field(ge=1)  # 1-3; a 4th check is refused like a signed-in one
    opened_rung: int = Field(default=0, ge=0, le=MAX_RUNG)  # highest rung the guest opened


class GuestPlanResult(CamelModel):
    grade: PlanGrade


def _clamp_seconds(value: int) -> int:
    return min(value, MAX_GUEST_ACTIVE_SECONDS)


class GuestAttempt(CamelModel):
    """One problem a guest worked on. `startedAt` identifies it: importing the same
    attempt again (same slug and `startedAt`) adds nothing."""

    slug: str = Field(min_length=1, max_length=MAX_ID_CHARS)
    code: Code = ""
    solved: bool = False
    started_at: AwareDatetime
    updated_at: AwareDatetime | None = None
    solved_at: AwareDatetime | None = None
    max_rung: int = Field(default=0, ge=0, le=MAX_RUNG)  # rungs 1..maxRung were opened
    plan: PlanCard | None = None  # the last plan checked
    plan_checks: int = Field(default=0, ge=0, le=MAX_PLAN_CHECKS)
    active_seconds: Annotated[int, Field(ge=0), AfterValidator(_clamp_seconds)] = 0
    planned_first: bool = False
    plan_skipped: bool = False


class GuestImport(CamelModel):
    attempts: list[GuestAttempt] = Field(max_length=MAX_GUEST_ATTEMPTS)


class GuestImportResult(CamelModel):
    imported: int

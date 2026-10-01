"""Guest mode (Section 16.2): plan checks and hints without an account, and the import
of a guest's attempts after sign-in.

Guests have no server state, so the browser tracks its attempt: it sends the check
number and the highest rung it opened with each plan check, and asks for hint rungs in
order itself. Grading is by keywords only (no AI for guests, Section 12.5).
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Path

from app.auth import CurrentUser
from app.content.hints import MAX_RUNG, MIN_RUNG, hint_content
from app.db import DbSession
from app.errors import ApiError
from app.learning.plan_grading import MAX_PLAN_CHECKS, grade_plan
from app.routers.content import Content
from app.schemas.guest import GuestImport, GuestImportResult, GuestPlanCheck, GuestPlanResult
from app.schemas.hints import HintContent
from app.services.attempts import check_plan_ids, workspace_problem
from app.services.guest import import_guest_attempts

router = APIRouter(prefix="/guest", tags=["guest"])


@router.post("/problems/{slug}/plan")
async def guest_check_plan(slug: str, body: GuestPlanCheck, content: Content) -> GuestPlanResult:
    problem = workspace_problem(content, slug)
    if body.check_number > MAX_PLAN_CHECKS:
        raise ApiError(409, "plan_checks_exhausted", "All 3 plan checks of this attempt are used.")
    check_plan_ids(content, body.plan)
    grade = grade_plan(
        body.plan,
        problem,
        families=content.pattern_families,
        structure_labels=content.structure_labels,
        check_number=body.check_number,
        opened_rung=body.opened_rung,
    )
    return GuestPlanResult(grade=grade)


@router.get("/problems/{slug}/hints/{rung}")
async def guest_hint(
    slug: str, rung: Annotated[int, Path(ge=MIN_RUNG, le=MAX_RUNG)], content: Content
) -> HintContent:
    return hint_content(content, workspace_problem(content, slug), rung)


@router.post("/import")
async def guest_import(
    body: GuestImport, user: CurrentUser, session: DbSession, content: Content
) -> GuestImportResult:
    imported = await import_guest_attempts(
        session, content, user.id, body.attempts, datetime.now(UTC)
    )
    await session.commit()
    return GuestImportResult(imported=imported)

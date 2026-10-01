"""`POST /guest/import`: turn a guest's localStorage attempts into the user's own rows.

- A solved guest attempt becomes a finished attempt with its outcome (from its max rung),
  and leaves progress, a review item and an activity day as a signed-in solve would, all
  dated when the guest solved it.
- An unsolved one becomes the problem's active attempt, so the Workspace resumes it
  (skipped when the user already has an active attempt of that problem).
- Idempotent: an attempt of the same problem with the same `startedAt` is never imported
  twice. Imports for one user run one at a time (the profile row is locked).
- Unknown and drill-only slugs are skipped. Imported attempts get no fading: guests work
  without it.
"""

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import Problem
from app.content.store import ContentStore
from app.learning.outcomes import solved_outcome
from app.learning.plan_grading import grade_plan
from app.models import Attempt, Profile
from app.schemas.guest import GuestAttempt
from app.services.attempts import ACTIVE, FINISHED, record_end, rung_entries
from app.services.progress import mark_attempted


async def _exists(session: AsyncSession, *conditions: ColumnElement[bool]) -> bool:
    found: bool | None = await session.scalar(select(exists().where(*conditions)))
    return bool(found)


def _attempt_row(
    content: ContentStore,
    user_id: uuid.UUID,
    problem: Problem,
    guest: GuestAttempt,
    last_seen: datetime,
    now: datetime,
) -> Attempt:
    plan_grade = None
    if guest.plan is not None and guest.plan_checks > 0:
        grade = grade_plan(
            guest.plan,
            problem,
            families=content.pattern_families,
            structure_labels=content.structure_labels,
            check_number=guest.plan_checks,
            opened_rung=guest.max_rung,
        )
        plan_grade = grade
    return Attempt(
        user_id=user_id,
        problem_slug=problem.slug,
        content_version=content.version,
        code=guest.code or problem.starter_code or "",
        plan=guest.plan.model_dump(mode="json", by_alias=True) if guest.plan else None,
        plan_checks=guest.plan_checks,
        plan_grade=plan_grade.model_dump(mode="json", by_alias=True) if plan_grade else None,
        # Only the last grade is known, so the first check's result is known for one check.
        plan_first_correct=plan_grade.correct if plan_grade and guest.plan_checks == 1 else None,
        planned_first=guest.planned_first,
        plan_skipped=guest.plan_skipped,
        max_rung=guest.max_rung,
        rungs_opened=rung_entries(list(range(1, guest.max_rung + 1)), last_seen),
        free_rungs=[],
        runs=0,
        submits=1 if guest.solved else 0,
        active_seconds=guest.active_seconds,
        started_at=guest.started_at,  # kept exactly: it identifies the guest attempt
        updated_at=now,
    )


async def import_guest_attempts(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    attempts: list[GuestAttempt],
    now: datetime,
) -> int:
    """Import `attempts` for the user; returns how many were added."""
    await session.execute(select(Profile.id).where(Profile.id == user_id).with_for_update())
    imported = 0
    for guest in attempts:
        problem = content.workspace_problem(guest.slug)
        if problem is None:
            continue
        slug = problem.slug
        mine = (Attempt.user_id == user_id, Attempt.problem_slug == slug)
        if await _exists(session, *mine, Attempt.started_at == guest.started_at):
            continue  # imported before
        # Client clocks may run ahead; nothing is dated after now.
        last_seen = min(guest.updated_at or guest.started_at, now)
        if guest.solved:
            solved_at = guest.solved_at or guest.updated_at or guest.started_at
            finished_at = min(max(solved_at, guest.started_at), now)
            attempt = _attempt_row(content, user_id, problem, guest, last_seen, now)
            outcome = solved_outcome(guest.max_rung)
            attempt.status = FINISHED
            attempt.outcome = outcome
            attempt.finished_at = finished_at
            session.add(attempt)
            await session.flush()
            await record_end(session, attempt, outcome, finished_at)
        else:
            if await _exists(session, *mine, Attempt.status == ACTIVE):
                continue  # the user already works on this problem
            session.add(_attempt_row(content, user_id, problem, guest, last_seen, now))
            await session.flush()
            await mark_attempted(session, user_id, slug, last_seen)
        imported += 1
    return imported

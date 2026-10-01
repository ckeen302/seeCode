"""Per-user problem endpoints (Section 16.2, signed in): the walkthrough after solving,
and notes."""

from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.auth import CurrentUser
from app.content.hints import walkthrough_payload
from app.db import DbSession
from app.errors import ApiError
from app.learning.mastery import is_solved
from app.models import Note
from app.routers.content import Content
from app.schemas.hints import WalkthroughPayload
from app.schemas.problems import NoteUpdate, NoteView
from app.services.attempts import workspace_problem
from app.services.progress import problem_status

router = APIRouter(prefix="/problems", tags=["problems"])


@router.get("/{slug}/walkthrough")
async def get_walkthrough(
    slug: str, user: CurrentUser, session: DbSession, content: Content
) -> WalkthroughPayload:
    """See it run (Section 7.4): only for problems the user solved; before that, the
    walkthrough is hint rung 5 of an attempt."""
    problem = workspace_problem(content, slug)
    if not is_solved(await problem_status(session, user.id, slug)):
        raise ApiError(
            403,
            "forbidden",
            "Solve this problem first. Until then, the walkthrough is hint rung 5.",
        )
    return walkthrough_payload(problem)


@router.get("/{slug}/notes")
async def get_notes(slug: str, user: CurrentUser, session: DbSession, content: Content) -> NoteView:
    workspace_problem(content, slug)
    note = await session.get(Note, (user.id, slug))
    if note is None:
        return NoteView(body="", updated_at=None)
    return NoteView(body=note.body, updated_at=note.updated_at)


@router.put("/{slug}/notes")
async def put_notes(
    slug: str, body: NoteUpdate, user: CurrentUser, session: DbSession, content: Content
) -> NoteView:
    workspace_problem(content, slug)
    now = datetime.now(UTC)
    stmt = pg_insert(Note).values(
        user_id=user.id, problem_slug=slug, body=body.body, updated_at=now
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Note.user_id, Note.problem_slug],
            set_={"body": stmt.excluded.body, "updated_at": stmt.excluded.updated_at},
        )
    )
    await session.commit()
    return NoteView(body=body.body, updated_at=now)

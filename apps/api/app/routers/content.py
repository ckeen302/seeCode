"""Public content endpoints (Section 16.2).

Answers stay on the server: problem details never carry approaches, signals, hints,
solution or viz, and a problem's pattern and twist are shown only once the signed-in
user solved it. Drill-only problems have no public page.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from app.auth import AuthUser, OptionalUser
from app.content.models import Structure, ToolkitCard
from app.content.store import ContentStore, UserProblem
from app.db import DbSession
from app.errors import ApiError
from app.models import ProblemProgress
from app.schemas.content import (
    PatternSummary,
    PatternView,
    ProblemListItem,
    ProblemPublic,
    RoadmapView,
)

router = APIRouter(prefix="/content", tags=["content"])


def get_content(request: Request) -> ContentStore:
    content: ContentStore = request.app.state.content
    return content


Content = Annotated[ContentStore, Depends(get_content)]


async def user_progress(session: DbSession, user: OptionalUser) -> dict[str, UserProblem] | None:
    """The user's problem_progress rows by slug; None when signed out."""
    if user is None:
        return None
    return await load_user_progress(session, user)


async def load_user_progress(session: DbSession, user: AuthUser) -> dict[str, UserProblem]:
    rows = await session.execute(
        select(
            ProblemProgress.problem_slug,
            ProblemProgress.status,
            ProblemProgress.best_rung,
            ProblemProgress.last_attempt_at,
        ).where(ProblemProgress.user_id == user.id)
    )
    return {
        slug: UserProblem(status=status, best_rung=best_rung, last_attempt_at=last_attempt_at)
        for slug, status, best_rung, last_attempt_at in rows
    }


Progress = Annotated[dict[str, UserProblem] | None, Depends(user_progress)]


@router.get("/roadmap")
async def get_roadmap(content: Content, progress: Progress) -> RoadmapView:
    return content.roadmap_view(progress)


@router.get("/patterns")
async def list_patterns(content: Content) -> list[PatternSummary]:
    return content.pattern_summaries()


@router.get("/patterns/{pattern_id}")
async def get_pattern(pattern_id: str, content: Content, progress: Progress) -> PatternView:
    view = content.pattern_view(pattern_id, progress)
    if view is None:
        raise ApiError(404, "not_found", "Pattern not found.")
    return view


@router.get("/structures")
async def list_structures(content: Content) -> list[Structure]:
    return content.structures


@router.get("/toolkit")
async def list_toolkit(content: Content) -> list[ToolkitCard]:
    return content.toolkit


@router.get("/problems")
async def list_problems(
    content: Content,
    progress: Progress,
    show_patterns: Annotated[bool, Query(alias="showPatterns")] = False,
) -> list[ProblemListItem]:
    return content.problem_list(progress, show_patterns=show_patterns)


@router.get("/problems/{slug}")
async def get_problem(slug: str, content: Content) -> ProblemPublic:
    problem = content.problem_public(slug)
    if problem is None:  # unknown or drill-only
        raise ApiError(404, "not_found", "Problem not found.")
    return problem

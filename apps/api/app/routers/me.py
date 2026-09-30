from fastapi import APIRouter

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import ApiError
from app.models import Profile
from app.schemas.me import ProfileView

router = APIRouter(tags=["me"])


@router.get("/me")
async def get_me(user: CurrentUser, session: DbSession) -> ProfileView:
    profile = await session.get(Profile, user.id)
    if profile is None:
        raise ApiError(404, "not_found", "Profile not found.")
    return ProfileView.model_validate(profile)

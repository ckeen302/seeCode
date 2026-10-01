"""The signed-in user's profile and account (Sections 6.9, 16.2 and 20): read and change
the profile, export every row, delete the account."""

from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import ApiError
from app.models import Profile
from app.schemas.me import ProfileView
from app.schemas.profile import ProfilePatch
from app.services.account import SupabaseAdmin, delete_account, export_data, update_profile

router = APIRouter(tags=["me"])


@router.get("/me")
async def get_me(user: CurrentUser, session: DbSession) -> ProfileView:
    profile = await session.get(Profile, user.id)
    if profile is None:
        raise ApiError(404, "not_found", "Profile not found.")
    return ProfileView.model_validate(profile)


@router.patch("/me")
async def patch_me(body: ProfilePatch, user: CurrentUser, session: DbSession) -> ProfileView:
    """Change the display name, time zone (an IANA name) or settings (merged per key)."""
    profile = await update_profile(session, user.id, body)
    view = ProfileView.model_validate(profile)
    await session.commit()
    return view


@router.get("/me/export")
async def export_me(request: Request, user: CurrentUser, session: DbSession) -> JSONResponse:
    """ "Export my data": the profile and every row the user owns, as one JSON download."""
    now = datetime.now(UTC)
    data = await export_data(session, user.id, request.app.state.content_version, now)
    return JSONResponse(
        jsonable_encoder(data),
        headers={
            "Content-Disposition": f'attachment; filename="seecode-export-{now:%Y-%m-%d}.json"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("/me", status_code=204)
async def delete_me(request: Request, user: CurrentUser, session: DbSession) -> Response:
    """ "Delete account": the profile and everything that cascades from it, and the
    Supabase auth user when the service role key is configured."""
    admin: SupabaseAdmin | None = request.app.state.supabase_admin
    await delete_account(session, user, admin)
    await session.commit()
    # The next request with this identity must not skip creating a profile.
    request.app.state.known_profiles.discard(user.id)
    return Response(status_code=204)

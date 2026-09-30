from fastapi import APIRouter, Request

from app.schemas.me import HealthView

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> HealthView:
    return HealthView(ok=True, content_version=request.app.state.content_version)

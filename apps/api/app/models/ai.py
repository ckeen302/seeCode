import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AiCache(Base):
    __tablename__ = "ai_cache"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    feature: Mapped[str] = mapped_column(Text)  # twist | nudge
    response: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AiUsage(Base):
    __tablename__ = "ai_usage"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="SET NULL")
    )
    feature: Mapped[str] = mapped_column(Text)
    cached: Mapped[bool] = mapped_column(Boolean)
    success: Mapped[bool] = mapped_column(Boolean)
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


Index("ai_usage_user_day", AiUsage.user_id, AiUsage.created_at)

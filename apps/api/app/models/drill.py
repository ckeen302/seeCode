import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import REAL, Boolean, DateTime, ForeignKey, Index, Integer, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DrillSession(Base):
    __tablename__ = "drill_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(Text)  # recognition | toolkit
    pattern_filter: Mapped[str | None] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DrillAnswer(Base):
    __tablename__ = "drill_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("drill_sessions.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(Text)  # recognition | toolkit
    problem_slug: Mapped[str | None] = mapped_column(Text)
    pattern_id: Mapped[str | None] = mapped_column(Text)
    toolkit_id: Mapped[str | None] = mapped_column(Text)
    answer: Mapped[dict[str, Any]] = mapped_column(JSONB)
    grade: Mapped[dict[str, Any]] = mapped_column(JSONB)
    correct: Mapped[bool] = mapped_column(Boolean)
    seconds: Mapped[float] = mapped_column(REAL)
    overtime: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


Index(
    "drill_answers_user_pattern",
    DrillAnswer.user_id,
    DrillAnswer.pattern_id,
    DrillAnswer.created_at.desc(),
)

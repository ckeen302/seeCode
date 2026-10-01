import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    problem_slug: Mapped[str] = mapped_column(Text)
    content_version: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    outcome: Mapped[str | None] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, server_default=text("''"))
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    plan_checks: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    plan_grade: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Migration 002: the first check's `correct`, and active seconds at the first correct check.
    plan_first_correct: Mapped[bool | None] = mapped_column(Boolean)
    plan_correct_seconds: Mapped[int | None] = mapped_column(Integer)
    planned_first: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    plan_skipped: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    max_rung: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    rungs_opened: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    free_rungs: Mapped[list[int]] = mapped_column(ARRAY(Integer), server_default=text("'{}'"))
    runs: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    submits: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    last_results: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    predictions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    nudges_used: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    active_seconds: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


Index(
    "attempts_user_problem",
    Attempt.user_id,
    Attempt.problem_slug,
    Attempt.started_at.desc(),
)
Index(
    "attempts_one_active",
    Attempt.user_id,
    Attempt.problem_slug,
    unique=True,
    postgresql_where=text("status = 'active'"),
)


class ProblemProgress(Base):
    __tablename__ = "problem_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    problem_slug: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text, server_default=text("'new'"))
    best_rung: Mapped[int | None] = mapped_column(Integer)
    first_solved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Note(Base):
    __tablename__ = "notes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    problem_slug: Mapped[str] = mapped_column(Text, primary_key=True)
    body: Mapped[str] = mapped_column(Text, server_default=text("''"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

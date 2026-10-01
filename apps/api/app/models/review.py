import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    REAL,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReviewItem(Base):
    __tablename__ = "review_items"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "ref", name="review_items_user_id_kind_ref_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(Text)  # problem_plan | toolkit
    ref: Mapped[str] = mapped_column(Text)  # problem slug or toolkit id
    resolve: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_days: Mapped[float] = mapped_column(REAL, server_default=text("0"))
    ease: Mapped[float] = mapped_column(REAL, server_default=text("2.5"))
    reps: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    lapses: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    last_grade: Mapped[str | None] = mapped_column(Text)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Migration 003: a borderline answer waiting for the user's Hard / Good rating
    # ({answer, planGrade, seconds, answeredAt}); null otherwise.
    pending: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


Index("review_items_due", ReviewItem.user_id, ReviewItem.due_at)


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("review_items.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    grade: Mapped[str] = mapped_column(Text)
    interval_before: Mapped[float] = mapped_column(REAL)
    interval_after: Mapped[float] = mapped_column(REAL)
    answer: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    plan_grade: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    seconds: Mapped[float | None] = mapped_column(REAL)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

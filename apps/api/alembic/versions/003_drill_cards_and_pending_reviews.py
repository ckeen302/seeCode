"""Drill session cards and pending review ratings (Sections 6.6, 6.7, 11.4 and 11.7).

- `drill_sessions.cards`: the cards dealt, in order, so answers can be checked against
  them (one answer per card, only cards of the session) and the end screen can list them.
  Each entry is `{id, slug}` (recognition) or `{id, toolkitId, phrase, options}`
  (toolkit), plus `reviewCreated: true` once a miss on it created a review item.
- `drill_sessions.add_missed`: the end screen's "Add missed to review" choice (on by
  default; turning it off removes the review items the session's misses created).
- `review_items.pending`: a borderline review answer (0.5 <= score < 0.8) waiting for the
  user's Hard / Good rating, so `POST /review/{itemId}/rate` only rates a real answer.

Both tables keep their row level security policies from 001, which cover every column.

Revision ID: 003
Revises: 002
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "drill_sessions",
        sa.Column(
            "cards",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "drill_sessions",
        sa.Column("add_missed", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column("review_items", sa.Column("pending", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("review_items", "pending")
    op.drop_column("drill_sessions", "add_missed")
    op.drop_column("drill_sessions", "cards")

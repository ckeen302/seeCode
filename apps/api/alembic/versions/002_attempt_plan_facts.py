"""Attempt plan facts: was the first plan check right, and when was the plan right.

`plan_first_correct` feeds the wrap-up's "plan right first time" (Section 7.8);
`plan_correct_seconds` (active seconds at the first correct check) feeds the median plan
time of Today and Stats (Sections 1.6, 6.8 and 11.8). The last PlanGrade alone cannot
tell either. `attempts` keeps its row level security policy from 001, which covers
every column.

Revision ID: 002
Revises: 001
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("attempts", sa.Column("plan_first_correct", sa.Boolean(), nullable=True))
    op.add_column("attempts", sa.Column("plan_correct_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("attempts", "plan_correct_seconds")
    op.drop_column("attempts", "plan_first_correct")

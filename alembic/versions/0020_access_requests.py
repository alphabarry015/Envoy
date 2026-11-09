"""access requests stored for admin review

Revision ID: 0020_access_requests
Revises: 0019_sender_settings
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.sql_files import execute_sql

revision: str = "0020_access_requests"
down_revision: Union[str, Sequence[str], None] = "0019_sender_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "access_requests",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("organization", sa.String(160), nullable=False),
        sa.Column("volume", sa.String(16), nullable=False),
        sa.Column("use_case", sa.Text(), nullable=False),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column(
            "decided_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined')", name="access_requests_status_check"
        ),
    )
    op.create_index("ix_access_requests_email", "access_requests", ["email"])
    op.create_index("ix_access_requests_status", "access_requests", ["status"])
    execute_sql("0020_access_requests_rls_upgrade.sql")


def downgrade() -> None:
    op.drop_index("ix_access_requests_status", table_name="access_requests")
    op.drop_index("ix_access_requests_email", table_name="access_requests")
    op.drop_table("access_requests")

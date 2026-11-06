"""store email templates per account

Revision ID: 0011_templates
Revises: 0010_user_display_name
Create Date: 2026-11-06

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from app.sql_files import execute_sql
from sqlalchemy.dialects import postgresql

revision: str = "0011_templates"
down_revision: Union[str, Sequence[str], None] = "0010_user_display_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("alias", sa.String(length=80), nullable=False),
        sa.Column("subject", sa.String(length=998), server_default="", nullable=False),
        sa.Column("html", sa.Text(), server_default="", nullable=False),
        sa.Column("body_text", sa.Text(), server_default="", nullable=False),
        sa.Column("from_name", sa.String(length=120), server_default="", nullable=False),
        sa.Column("from_email", sa.String(length=320), server_default="", nullable=False),
        sa.Column("reply_to", sa.String(length=320), server_default="", nullable=False),
        sa.Column("preview_text", sa.String(length=998), server_default="", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column(
            "variables",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("document", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "alias", name="uq_templates_user_alias"),
    )
    op.create_index("ix_templates_user_id", "templates", ["user_id"])
    execute_sql("0011_templates_rls_upgrade.sql")


def downgrade() -> None:
    execute_sql("0011_templates_rls_downgrade.sql")
    op.drop_index("ix_templates_user_id", table_name="templates")
    op.drop_table("templates")

"""security hardening: auth trigger, RLS, login throttling, log indexes

Revision ID: 0017_security_hardening
Revises: 0016_domain_providers
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.sql_files import execute_sql

revision: str = "0017_security_hardening"
down_revision: Union[str, Sequence[str], None] = "0016_domain_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_login_attempts_key_created", "login_attempts", ["key", "created_at"])
    op.create_index(
        "ix_email_logs_provider_created",
        "email_logs",
        ["provider", sa.text("created_at DESC")],
    )
    op.create_index("ix_email_logs_api_key_created", "email_logs", ["api_key_id", "created_at"])

    execute_sql("0017_upsert_envoy_auth_user.sql")
    execute_sql("0017_sync_envoy_user_from_auth.sql")
    execute_sql("0004_auth_privileges.sql")
    execute_sql("0017_hardening_upgrade.sql")


def downgrade() -> None:
    execute_sql("0017_hardening_downgrade.sql")
    execute_sql("0004_upsert_envoy_auth_user.sql")
    execute_sql("0004_sync_envoy_user_from_auth.sql")
    op.drop_index("ix_email_logs_api_key_created", table_name="email_logs")
    op.drop_index("ix_email_logs_provider_created", table_name="email_logs")
    op.drop_index("ix_login_attempts_key_created", table_name="login_attempts")
    op.drop_table("login_attempts")

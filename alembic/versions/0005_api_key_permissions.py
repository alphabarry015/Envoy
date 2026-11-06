"""store api key mode, scopes and quotas

Revision ID: 0005_api_key_permissions
Revises: 0004_supabase_auth_sync
Create Date: 2026-11-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_api_key_permissions"
down_revision: Union[str, Sequence[str], None] = "0004_supabase_auth_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column("mode", sa.String(length=16), server_default="live", nullable=False),
    )
    op.add_column(
        "api_keys",
        sa.Column(
            "scopes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("""'["send"]'::jsonb"""),
            nullable=False,
        ),
    )
    op.add_column("api_keys", sa.Column("daily_quota", sa.Integer(), nullable=True))
    op.add_column("api_keys", sa.Column("monthly_quota", sa.Integer(), nullable=True))
    op.add_column("api_keys", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("api_keys", "revoked_at")
    op.drop_column("api_keys", "monthly_quota")
    op.drop_column("api_keys", "daily_quota")
    op.drop_column("api_keys", "scopes")
    op.drop_column("api_keys", "mode")

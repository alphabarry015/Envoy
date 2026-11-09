"""multi-provider email settings and log provider column

Revision ID: 0013_providers
Revises: 0012_email_logs_user_created
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_providers"
down_revision: Union[str, Sequence[str], None] = "0012_email_logs_user_created"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULTS = (
    ("ses", True, 0),
    ("resend", True, 10),
    ("brevo", True, 20),
    ("mailtrap", True, 30),
)


def upgrade() -> None:
    op.add_column("email_logs", sa.Column("provider", sa.String(length=32), nullable=True))
    op.create_index("ix_email_logs_provider", "email_logs", ["provider"])
    op.execute("UPDATE email_logs SET provider = 'ses' WHERE provider IS NULL AND ses_message_id IS NOT NULL")

    op.create_table(
        "provider_settings",
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="100", nullable=False),
        sa.Column("daily_limit", sa.Integer(), nullable=True),
        sa.Column("monthly_limit", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("provider"),
    )
    settings = sa.table(
        "provider_settings",
        sa.column("provider", sa.String),
        sa.column("enabled", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        settings,
        [
            {"provider": name, "enabled": enabled, "sort_order": order}
            for name, enabled, order in _DEFAULTS
        ],
    )


def downgrade() -> None:
    op.drop_table("provider_settings")
    op.drop_index("ix_email_logs_provider", table_name="email_logs")
    op.drop_column("email_logs", "provider")

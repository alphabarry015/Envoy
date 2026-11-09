"""preferred provider on api keys and webhooks

Revision ID: 0015_provider_choice
Revises: 0014_remove_mailersend
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_provider_choice"
down_revision: Union[str, Sequence[str], None] = "0014_remove_mailersend"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("preferred_provider", sa.String(length=32), nullable=True))
    op.add_column(
        "webhooks",
        sa.Column("providers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("webhooks", "providers")
    op.drop_column("api_keys", "preferred_provider")

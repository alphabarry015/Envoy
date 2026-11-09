"""sending providers on domains

Revision ID: 0016_domain_providers
Revises: 0015_provider_choice
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_domain_providers"
down_revision: Union[str, Sequence[str], None] = "0015_provider_choice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "providers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[\"ses\"]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("domains", "providers")

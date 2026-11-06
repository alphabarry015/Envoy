"""store the per-domain BYODKIM selector and encrypted private key

Revision ID: 0009_domain_byodkim
Revises: 0008_logs_and_suppression_owner
Create Date: 2026-11-06

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_domain_byodkim"
down_revision: Union[str, Sequence[str], None] = "0008_logs_and_suppression_owner"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("domains", sa.Column("dkim_selector", sa.String(length=63), nullable=True))
    op.add_column("domains", sa.Column("encrypted_dkim_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("domains", "encrypted_dkim_key")
    op.drop_column("domains", "dkim_selector")

"""users: optional end date of an active member's access

Revision ID: 0024_access_expiry
Revises: 0023_password_reset
Create Date: 2026-11-11

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_access_expiry"
down_revision: Union[str, Sequence[str], None] = "0023_password_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "access_expires_at")

"""users: one-time password reset code

Revision ID: 0023_password_reset
Revises: 0022_access_request_unique
Create Date: 2026-11-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_password_reset"
down_revision: Union[str, Sequence[str], None] = "0022_access_request_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_reset_code", sa.String(64), nullable=True))
    op.add_column(
        "users", sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("password_reset_attempts", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "password_reset_attempts")
    op.drop_column("users", "password_reset_expires_at")
    op.drop_column("users", "password_reset_code")

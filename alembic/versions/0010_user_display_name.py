"""store the invited person's display name

Revision ID: 0010_user_display_name
Revises: 0009_domain_byodkim
Create Date: 2026-11-06

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_user_display_name"
down_revision: Union[str, Sequence[str], None] = "0009_domain_byodkim"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "display_name")

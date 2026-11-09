"""per-domain sender defaults and admin invite reply-to

Revision ID: 0019_sender_settings
Revises: 0018_token_version
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_sender_settings"
down_revision: Union[str, Sequence[str], None] = "0018_token_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column("from_local_part", sa.String(64), nullable=False, server_default="noreply"),
    )
    op.add_column("domains", sa.Column("from_name", sa.String(120), nullable=True))
    op.add_column("domains", sa.Column("reply_to", sa.String(320), nullable=True))
    op.add_column(
        "domains", sa.Column("sender_configured_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("invite_reply_to", sa.String(320), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "invite_reply_to")
    op.drop_column("domains", "sender_configured_at")
    op.drop_column("domains", "reply_to")
    op.drop_column("domains", "from_name")
    op.drop_column("domains", "from_local_part")

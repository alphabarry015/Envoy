"""email_logs.kind: api sends vs platform invitations

Revision ID: 0021_email_log_kind
Revises: 0020_access_requests
Create Date: 2026-11-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_email_log_kind"
down_revision: Union[str, Sequence[str], None] = "0020_access_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "email_logs",
        sa.Column("kind", sa.String(16), nullable=False, server_default="api"),
    )
    op.create_check_constraint("email_logs_kind_check", "email_logs", "kind IN ('api', 'invite')")


def downgrade() -> None:
    op.drop_constraint("email_logs_kind_check", "email_logs", type_="check")
    op.drop_column("email_logs", "kind")

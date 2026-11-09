"""access_requests: one pending request per email

Revision ID: 0022_access_request_unique
Revises: 0021_email_log_kind
Create Date: 2026-11-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_access_request_unique"
down_revision: Union[str, Sequence[str], None] = "0021_email_log_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX = "uq_access_requests_pending_email"


def upgrade() -> None:
    # Older duplicates are kept as history: only the newest pending request per email stays pending.
    op.execute(
        """
        UPDATE access_requests SET status = 'declined', decided_at = now()
        WHERE status = 'pending' AND id NOT IN (
            SELECT DISTINCT ON (lower(email)) id FROM access_requests
            WHERE status = 'pending'
            ORDER BY lower(email), created_at DESC
        )
        """
    )
    op.create_index(
        INDEX,
        "access_requests",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="access_requests")

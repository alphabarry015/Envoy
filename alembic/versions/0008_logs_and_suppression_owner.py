"""store message bodies and the account that owns a suppression

Revision ID: 0008_logs_and_suppression_owner
Revises: 0007_webhook_signing_secret
Create Date: 2026-11-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_logs_and_suppression_owner"
down_revision: Union[str, Sequence[str], None] = "0007_webhook_signing_secret"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_logs", sa.Column("body_html", sa.Text(), nullable=True))
    op.add_column("email_logs", sa.Column("body_text", sa.Text(), nullable=True))
    op.add_column("suppression_list", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_suppression_list_user_id", "suppression_list", ["user_id"])
    op.create_foreign_key(
        "fk_suppression_list_user_id",
        "suppression_list",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_suppression_list_user_id", "suppression_list", type_="foreignkey")
    op.drop_index("ix_suppression_list_user_id", table_name="suppression_list")
    op.drop_column("suppression_list", "user_id")
    op.drop_column("email_logs", "body_text")
    op.drop_column("email_logs", "body_html")

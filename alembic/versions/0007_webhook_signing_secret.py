"""store an encrypted webhook signing secret

Revision ID: 0007_webhook_signing_secret
Revises: 0006_webhooks
Create Date: 2026-11-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_webhook_signing_secret"
down_revision: Union[str, Sequence[str], None] = "0006_webhooks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("webhooks", sa.Column("encrypted_secret", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("webhooks", "encrypted_secret")

"""remove mailersend provider

Revision ID: 0014_remove_mailersend
Revises: 0013_providers
Create Date: 2026-11-08

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0014_remove_mailersend"
down_revision: Union[str, Sequence[str], None] = "0013_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM provider_settings WHERE provider = 'mailersend'")


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO provider_settings (provider, enabled, sort_order)
        VALUES ('mailersend', true, 30)
        ON CONFLICT (provider) DO NOTHING
        """
    )

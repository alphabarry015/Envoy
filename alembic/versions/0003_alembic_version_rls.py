"""lock alembic_version behind row level security

Revision ID: 0003_alembic_version_rls
Revises: 0002_row_level_security
Create Date: 2026-11-05

alembic_version est créée dans public et héritait des droits anon /
authenticated. Même verrou que les tables applicatives.

"""
from __future__ import annotations

from typing import Sequence, Union

from app.sql_files import execute_sql

revision: str = "0003_alembic_version_rls"
down_revision: Union[str, Sequence[str], None] = "0002_row_level_security"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    execute_sql("0003_alembic_version_rls_upgrade.sql")


def downgrade() -> None:
    execute_sql("0003_alembic_version_rls_downgrade.sql")

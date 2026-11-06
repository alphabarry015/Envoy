"""lock envoy tables behind row level security

Revision ID: 0002_row_level_security
Revises: 0001_initial
Create Date: 2026-11-05

Les tables sont dans public, donc PostgREST les expose. anon et authenticated
reçoivent tous les droits via les privilèges par défaut Supabase. La RLS sans
politique refuse ces rôles. postgres et service_role ont BYPASSRLS : l'API
Envoy, connectée en postgres, continue de tout voir.

"""
from __future__ import annotations

from typing import Sequence, Union

from app.sql_files import execute_sql

revision: str = "0002_row_level_security"
down_revision: Union[str, Sequence[str], None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    execute_sql("0002_row_level_security_upgrade.sql")


def downgrade() -> None:
    execute_sql("0002_row_level_security_downgrade.sql")

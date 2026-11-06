"""mirror envoy users with supabase auth.users

Revision ID: 0004_supabase_auth_sync
Revises: 0003_alembic_version_rls
Create Date: 2026-11-05

La page Authentification de Supabase lit auth.users. Envoy écrit dans
public.users. Cette migration recopie les comptes existants et propage
chaque création faite dans l'interface Supabase vers public.users.

Les fonctions SQL sont dans sql/.
"""
from __future__ import annotations

from typing import Sequence, Union

from app.sql_files import execute_sql

revision: str = "0004_supabase_auth_sync"
down_revision: Union[str, Sequence[str], None] = "0003_alembic_version_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    execute_sql("0004_upsert_envoy_auth_user.sql")
    execute_sql("0004_sync_envoy_user_from_auth.sql")
    execute_sql("0004_auth_privileges.sql")
    execute_sql("0004_auth_trigger.sql")
    execute_sql("0004_backfill_auth_users.sql")


def downgrade() -> None:
    execute_sql("0004_auth_downgrade.sql")

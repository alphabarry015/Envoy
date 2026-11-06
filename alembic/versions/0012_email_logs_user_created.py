"""index email logs by owner and time

Revision ID: 0012_email_logs_user_created
Revises: 0011_templates
Create Date: 2026-11-06

Les listes et l'aperçu filtrent par utilisateur puis trient par date.
"""
from __future__ import annotations

from typing import Sequence, Union

from app.sql_files import execute_sql

revision: str = "0012_email_logs_user_created"
down_revision: Union[str, Sequence[str], None] = "0011_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    execute_sql("0012_email_logs_user_created_upgrade.sql")


def downgrade() -> None:
    execute_sql("0012_email_logs_user_created_downgrade.sql")

"""Lit les requêtes SQL du dossier sql/ à la racine du dépôt."""

from __future__ import annotations

from pathlib import Path

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


def read_sql(name: str) -> str:
    return (SQL_DIR / name).read_text(encoding="utf-8").strip()


def execute_sql(name: str) -> None:
    """Exécute un fichier de sql/. Les fonctions plpgsql restent en un seul ordre."""
    from alembic import op

    sql = read_sql(name)
    if "$envoy$" in sql or "$$" in sql:
        op.execute(sql)
        return
    for part in sql.split(";"):
        lines = [line for line in part.splitlines() if not line.strip().startswith("--")]
        statement = "\n".join(lines).strip()
        if statement:
            op.execute(statement)

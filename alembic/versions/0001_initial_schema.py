"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role = postgresql.ENUM("admin", "user", name="user_role")
user_status = postgresql.ENUM("pending", "active", "suspended", name="user_status")
domain_status = postgresql.ENUM("pending", "verified", "failed", name="domain_status")
dkim_status = postgresql.ENUM(
    "NOT_STARTED",
    "PENDING",
    "SUCCESS",
    "FAILED",
    "TEMPORARY_FAILURE",
    name="dkim_status",
)
email_status = postgresql.ENUM(
    "queued",
    "sent",
    "delivered",
    "bounced",
    "complained",
    "failed",
    "suppressed",
    name="email_status",
)
suppression_reason = postgresql.ENUM(
    "hard_bounce",
    "complaint",
    "unsubscribe",
    "manual",
    name="suppression_reason",
)


def upgrade() -> None:
    user_role.create(op.get_bind(), checkfirst=True)
    user_status.create(op.get_bind(), checkfirst=True)
    domain_status.create(op.get_bind(), checkfirst=True)
    dkim_status.create(op.get_bind(), checkfirst=True)
    email_status.create(op.get_bind(), checkfirst=True)
    suppression_reason.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("role", user_role, server_default="user", nullable=False),
        sa.Column("status", user_status, server_default="pending", nullable=False),
        sa.Column("invite_token", sa.String(length=128), nullable=True),
        sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_domains", sa.Integer(), nullable=True),
        sa.Column("daily_send_quota", sa.Integer(), nullable=True),
        sa.Column("monthly_send_quota", sa.Integer(), nullable=True),
        sa.Column("can_create_api_keys", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invite_token"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("key_prefix", sa.String(length=32), nullable=False),
        sa.Column("hashed_key", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hashed_key"),
    )
    op.create_index(op.f("ix_api_keys_user_id"), "api_keys", ["user_id"], unique=False)
    op.create_index(op.f("ix_api_keys_key_prefix"), "api_keys", ["key_prefix"], unique=False)

    op.create_table(
        "domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", domain_status, server_default="pending", nullable=False),
        sa.Column("dkim_status", dkim_status, server_default="NOT_STARTED", nullable=False),
        sa.Column("ses_identity_arn", sa.String(length=512), nullable=True),
        sa.Column(
            "dns_records",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_domains_user_id"), "domains", ["user_id"], unique=False)
    op.create_index(op.f("ix_domains_name"), "domains", ["name"], unique=True)

    op.create_table(
        "email_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("api_key_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("message_id", sa.String(length=64), nullable=False),
        sa.Column("ses_message_id", sa.String(length=128), nullable=True),
        sa.Column("from_address", sa.String(length=320), nullable=False),
        sa.Column("to_addresses", postgresql.ARRAY(sa.String(length=320)), nullable=False),
        sa.Column("cc_addresses", postgresql.ARRAY(sa.String(length=320)), nullable=True),
        sa.Column("bcc_addresses", postgresql.ARRAY(sa.String(length=320)), nullable=True),
        sa.Column("subject", sa.String(length=998), nullable=False),
        sa.Column("status", email_status, server_default="queued", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_logs_user_id"), "email_logs", ["user_id"], unique=False)
    op.create_index(op.f("ix_email_logs_domain_id"), "email_logs", ["domain_id"], unique=False)
    op.create_index(op.f("ix_email_logs_api_key_id"), "email_logs", ["api_key_id"], unique=False)
    op.create_index(op.f("ix_email_logs_message_id"), "email_logs", ["message_id"], unique=True)
    op.create_index(op.f("ix_email_logs_ses_message_id"), "email_logs", ["ses_message_id"], unique=False)
    op.create_index(op.f("ix_email_logs_status"), "email_logs", ["status"], unique=False)
    op.create_index(op.f("ix_email_logs_created_at"), "email_logs", ["created_at"], unique=False)

    op.create_table(
        "suppression_list",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("reason", suppression_reason, nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_suppression_list_email"), "suppression_list", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_suppression_list_email"), table_name="suppression_list")
    op.drop_table("suppression_list")

    op.drop_index(op.f("ix_email_logs_created_at"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_status"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_ses_message_id"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_message_id"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_api_key_id"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_domain_id"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_user_id"), table_name="email_logs")
    op.drop_table("email_logs")

    op.drop_index(op.f("ix_domains_name"), table_name="domains")
    op.drop_index(op.f("ix_domains_user_id"), table_name="domains")
    op.drop_table("domains")

    op.drop_index(op.f("ix_api_keys_key_prefix"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_user_id"), table_name="api_keys")
    op.drop_table("api_keys")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    suppression_reason.drop(op.get_bind(), checkfirst=True)
    email_status.drop(op.get_bind(), checkfirst=True)
    dkim_status.drop(op.get_bind(), checkfirst=True)
    domain_status.drop(op.get_bind(), checkfirst=True)
    user_status.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)

"""Compat : les webhooks SES réutilisent delivery_events."""

from app.services.delivery_events import apply_ses_notification

__all__ = ["apply_ses_notification"]

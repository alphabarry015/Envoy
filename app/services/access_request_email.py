"""Emails around access requests: the admin notification and the decline note."""

from __future__ import annotations

from html import escape

from app.services.email_layout import BLUE, INK, LINE, MUTED, button, field, one_line, paragraph, render

VOLUME_LABELS = {
    "<10k": "Under 10,000 emails a month",
    "10k-100k": "10,000 to 100,000 emails a month",
    "100k-1M": "100,000 to 1 million emails a month",
    "1M+": "More than 1 million emails a month",
}


def render_admin_notification(
    *,
    full_name: str,
    email: str,
    organization: str,
    volume: str,
    use_case: str,
    review_url: str,
    recipient: str,
    site_url: str,
) -> tuple[str, str, str]:
    """Returns (subject, text, html) for the admin who reviews the request."""
    name = one_line(full_name, 120)
    org = one_line(organization, 160)
    volume_label = VOLUME_LABELS.get(volume, volume)
    subject = f"Access request from {name} ({org})"[:200]

    text = (
        f"{name} from {org} asked for access to Envoy.\n\n"
        f"Email: {email}\n"
        f"Organization: {org}\n"
        f"Expected volume: {volume_label}\n\n"
        f"What they want to send:\n{use_case}\n\n"
        f"Accept or decline in the console:\n{review_url}\n\n"
        "Reply to this email to write to them directly.\n"
    )

    body = "\n".join(
        [
            paragraph(
                f'<strong style="color:{INK};font-weight:600">{escape(name)}</strong> from '
                f'<strong style="color:{INK};font-weight:600">{escape(org)}</strong> wants to send email with Envoy. '
                "Review the request and accept or decline it from the console.",
                margin="0 0 24px",
            ),
            f'<div style="margin:0 0 24px;padding:20px 20px 6px;border:1px solid {LINE};border-radius:4px;background:#fafafa">',
            field("Email", email),
            field("Organization", org),
            field("Expected volume", volume_label),
            "</div>",
            f'<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:{INK}">What they want to send</p>',
            f'<div style="margin:0 0 28px;padding:0 0 0 14px;border-left:2px solid {BLUE};font-size:15px;line-height:1.65;'
            f'color:{MUTED};white-space:pre-wrap;word-break:break-word">{escape(use_case)}</div>',
            button(review_url, "Review in the console"),
            paragraph(
                f"Reply to this email to write to {escape(name)} directly.",
                size=13,
                margin="20px 0 0",
            ),
        ]
    )
    html = render(
        title=subject,
        preheader=f"{name} from {org} asked for access. {volume_label}.",
        kicker="Access request",
        heading="New access request",
        body_html=body,
        site_url=site_url,
        recipient=recipient,
        footer_note="You receive this because you review access requests for this Envoy workspace.",
    )
    return subject, text, html


def render_decline(*, full_name: str, recipient: str, site_url: str) -> tuple[str, str, str]:
    """Returns (subject, text, html) for a requester whose request was declined."""
    first = one_line(full_name, 120).split(" ")[0] or "there"
    subject = "About your Envoy access request"
    text = (
        f"Hi {first},\n\n"
        "Thanks for your interest in Envoy. We can't open an account for you right now.\n\n"
        "If your needs change, you're welcome to send a new request later.\n\n"
        f"Envoy · {site_url}\n"
        f"Sent to {recipient}.\n"
    )
    body = "\n".join(
        [
            paragraph(f"Hi {escape(first)},"),
            paragraph("Thanks for your interest in Envoy. We can't open an account for you right now."),
            paragraph(
                "If your needs change, you're welcome to send a new request later.",
                margin="0 0 28px",
            ),
            button(f"{site_url}/request-access", "Send a new request", ghost=True),
        ]
    )
    html = render(
        title=subject,
        preheader="Thanks for your interest in Envoy.",
        kicker="Access request",
        heading="Your access request",
        body_html=body,
        site_url=site_url,
        recipient=recipient,
        footer_note="You receive this because you asked for access to Envoy.",
    )
    return subject, text, html

"""Invitation email: one action, a typeable code, shared Envoy layout."""

from __future__ import annotations

from datetime import datetime
from html import escape

from app.services.email_layout import BLUE, INK, LINE, MONO, MUTED, SOFT, button, one_line, paragraph, render


def render_invite(
    *,
    link: str,
    code: str,
    expires: datetime | None,
    recipient: str,
    inviter: str | None,
    site_url: str,
    invitee: str | None = None,
) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    when = expires.strftime("%B %d, %Y at %H:%M UTC") if expires else None
    validity_text = f"expire on {when}" if when else "do not expire"
    # Only a display name is shown: the inviter's email address never appears in the email.
    name = one_line(inviter)
    who = name if name and "@" not in name else "The Envoy team"
    invitee_name = one_line(invitee)
    first = invitee_name.split(" ")[0] if invitee_name and "@" not in invitee_name else ""
    greeting = f"Hi {first}," if first else "Hi,"
    subject = f"{who} invited you to Envoy"
    login_url = f"{site_url}/console/login"

    text = (
        f"{greeting}\n\n"
        f"{who} invited you to join their workspace on Envoy.\n\n"
        "Envoy is where your team sends transactional email from its own domains: "
        "password resets, receipts, alerts.\n\n"
        "Option 1, one click:\n"
        f"{link}\n\n"
        "Option 2, with your invitation code:\n"
        f'Open {login_url}, choose "Have an invitation code?" and enter:\n'
        f"    {code}\n\n"
        f"You'll choose your password there. The link and the code work once "
        f"and {validity_text}.\n\n"
        "Didn't expect this? Ignore this email. Nothing is created until you set a password.\n\n"
        f"Envoy · {site_url}\n"
        f"Sent to {recipient}.\n"
    )

    safe_link = escape(link, quote=True)
    body = "\n".join(
        [
            paragraph(escape(greeting)),
            paragraph(
                f'<strong style="color:{INK};font-weight:600">{escape(who)}</strong> invited you to join their workspace. '
                "Envoy is where your team sends transactional email from its own domains: password resets, receipts, alerts."
            ),
            paragraph("Set your password and you're in. It takes less than a minute.", margin="0 0 28px"),
            button(link, "Accept the invitation"),
            f'<div style="margin:32px 0 0;padding:20px;background:#f5f8ff;border:1px solid #dbe6ff;border-radius:4px">'
            f'<p style="margin:0 0 8px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{MUTED}">Your invitation code</p>'
            f'<p style="margin:0 0 12px;font-family:{MONO};font-size:22px;font-weight:600;letter-spacing:0.08em;color:{INK}">{escape(code)}</p>'
            f'<p style="margin:0;font-size:13px;line-height:1.6;color:{MUTED}">Prefer to type it? Open the '
            f'<a href="{escape(login_url, quote=True)}" style="color:{BLUE};text-decoration:none;font-weight:600">console sign-in page</a>, '
            f'choose <strong style="color:{INK};font-weight:600">Have an invitation code?</strong> and enter this code.</p>'
            "</div>",
            paragraph(
                (
                    f'The button and the code work once and expire on <strong style="color:{INK};font-weight:600">{escape(when)}</strong>.'
                    if when
                    else "The button and the code work once and do not expire."
                ),
                size=13,
                margin="24px 0 0",
            ),
            f'<div style="margin:20px 0 0;padding:16px 0 0;border-top:1px solid {LINE}">'
            f'<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:{SOFT}">Button not working? Paste this address into your browser:</p>'
            f'<p style="margin:0;font-family:{MONO};font-size:12px;line-height:1.6;word-break:break-all">'
            f'<a href="{safe_link}" style="color:{BLUE};text-decoration:none">{escape(link)}</a></p>'
            "</div>",
        ]
    )
    html = render(
        title=subject,
        preheader=f"{who} invited you to Envoy. Your invitation code: {code}",
        kicker="Invitation",
        heading="You're invited to Envoy",
        body_html=body,
        site_url=site_url,
        recipient=recipient,
        footer_note="Didn't expect this invitation? You can ignore this email. Nothing is created until you set a password.",
    )
    return subject, text, html

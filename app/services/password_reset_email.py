"""Password reset email: a 6-digit code typed in the console, shared Envoy layout."""

from __future__ import annotations

from html import escape

from app.services.email_layout import BLUE, INK, MONO, MUTED, one_line, paragraph, render


def format_reset_code(code: str) -> str:
    return f"{code[:3]}-{code[3:]}"


def render_password_reset(
    *,
    code: str,
    minutes: int,
    recipient: str,
    name: str | None,
    site_url: str,
) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    shown = format_reset_code(code)
    clean = one_line(name)
    first = clean.split(" ")[0] if clean and "@" not in clean else ""
    greeting = f"Hi {first}," if first else "Hi,"
    subject = "Your Envoy password reset code"
    login_url = f"{site_url}/console/login"

    text = (
        f"{greeting}\n\n"
        "Someone asked to reset the password of your Envoy console account.\n\n"
        "Your code:\n"
        f"    {shown}\n\n"
        f"Enter it on the console sign-in page ({login_url}), then choose a new password. "
        f"The code works once and expires in {minutes} minutes.\n\n"
        "Didn't ask for this? Ignore this email. Your password stays the same.\n\n"
        f"Envoy · {site_url}\n"
        f"Sent to {recipient}.\n"
    )

    body = "\n".join(
        [
            paragraph(escape(greeting)),
            paragraph(
                "Someone asked to reset the password of your Envoy console account. "
                "Enter this code in the console, then choose a new password.",
                margin="0 0 24px",
            ),
            '<div style="margin:0;padding:20px;background:#f5f8ff;border:1px solid #dbe6ff;border-radius:4px;text-align:center">'
            f'<p style="margin:0 0 8px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{MUTED}">Your reset code</p>'
            f'<p style="margin:0;font-family:{MONO};font-size:30px;font-weight:600;letter-spacing:0.18em;color:{INK}">{escape(shown)}</p>'
            "</div>",
            paragraph(
                f'The code works once and expires in <strong style="color:{INK};font-weight:600">{minutes} minutes</strong>. '
                f'Open the <a href="{escape(login_url, quote=True)}" style="color:{BLUE};text-decoration:none;font-weight:600">console sign-in page</a> '
                f'and choose <strong style="color:{INK};font-weight:600">Forgot password?</strong> if you closed it.',
                size=13,
                margin="24px 0 0",
            ),
        ]
    )
    html = render(
        title=subject,
        preheader=f"Your Envoy reset code: {shown}. It expires in {minutes} minutes.",
        kicker="Security",
        heading="Reset your password",
        body_html=body,
        site_url=site_url,
        recipient=recipient,
        footer_note="Didn't ask for this? You can ignore this email. Your password stays the same.",
    )
    return subject, text, html

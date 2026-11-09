"""Invitation email: header with the Envoy mark on the left, one action, a typeable code, footer."""

from __future__ import annotations

from datetime import datetime
from html import escape

BLUE = "#0A4BD6"
INK = "#0a0a0a"
MUTED = "#525252"
SOFT = "#a3a3a3"
LINE = "#e5e5e5"
FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

_MARK = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 32 32" '
    'role="img" aria-label="Envoy" style="display:inline-block;vertical-align:middle">'
    f'<rect width="32" height="32" rx="4" fill="{BLUE}"/>'
    '<rect x="12" y="12" width="8" height="8" fill="#ffffff"/></svg>'
)


def render_invite(
    *,
    link: str,
    code: str,
    expires: datetime,
    recipient: str,
    inviter: str | None,
    site_url: str,
) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    when = expires.strftime("%B %d, %Y at %H:%M UTC")
    who = " ".join((inviter or "").split())[:80] or "An Envoy administrator"
    subject = f"{who} invited you to Envoy"
    login_url = f"{site_url}/console/login"

    text = (
        f"{who} invited you to join their workspace on Envoy.\n\n"
        "Envoy is where your team sends transactional email from its own domains: "
        "password resets, receipts, alerts.\n\n"
        "Option 1, one click:\n"
        f"{link}\n\n"
        "Option 2, with your invitation code:\n"
        f'Open {login_url}, choose "Have an invitation code?" and enter:\n'
        f"    {code}\n\n"
        f"You'll choose your password there. The link and the code work once "
        f"and expire on {when}.\n\n"
        "Didn't expect this? Ignore this email. Nothing is created until you set a password.\n\n"
        f"Envoy · {site_url}\n"
        f"Sent to {recipient}.\n"
    )

    safe_link = escape(link, quote=True)
    safe_login = escape(login_url, quote=True)
    safe_site = escape(site_url, quote=True)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:{FONT};color:{INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(who)} invited you to Envoy. Your invitation code: {escape(code)}</div>
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <div style="padding:0 4px 20px;text-align:left">
    <a href="{safe_site}" style="text-decoration:none;color:{INK};display:inline-block">
      {_MARK}<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:15px;font-weight:600;letter-spacing:0.18em;color:{INK}">ENVOY</span>
    </a>
  </div>

  <div style="background:#ffffff;border:1px solid {LINE};border-radius:4px;padding:36px 32px">
    <p style="margin:0 0 14px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{BLUE}">&#9632; Invitation</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:{INK}">You're invited to Envoy</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{MUTED}">
      <strong style="color:{INK};font-weight:600">{escape(who)}</strong> invited you to join their workspace.
      Envoy is where your team sends transactional email from its own domains: password resets, receipts, alerts.
    </p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:{MUTED}">
      Set your password and you're in. It takes less than a minute.
    </p>
    <a href="{safe_link}" style="display:inline-block;background:{BLUE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:4px">Accept the invitation</a>

    <div style="margin:32px 0 0;padding:20px;background:#f5f8ff;border:1px solid #dbe6ff;border-radius:4px">
      <p style="margin:0 0 8px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{MUTED}">Your invitation code</p>
      <p style="margin:0 0 12px;font-family:{MONO};font-size:22px;font-weight:600;letter-spacing:0.08em;color:{INK}">{escape(code)}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:{MUTED}">
        Prefer to type it? Open the <a href="{safe_login}" style="color:{BLUE};text-decoration:none;font-weight:600">console sign-in page</a>,
        choose <strong style="color:{INK};font-weight:600">Have an invitation code?</strong> and enter this code.
      </p>
    </div>

    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:{MUTED}">
      The button and the code work once and expire on <strong style="color:{INK};font-weight:600">{escape(when)}</strong>.
    </p>
    <div style="margin:20px 0 0;padding:16px 0 0;border-top:1px solid {LINE}">
      <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:{SOFT}">Button not working? Paste this address into your browser:</p>
      <p style="margin:0;font-family:{MONO};font-size:12px;line-height:1.6;word-break:break-all"><a href="{safe_link}" style="color:{BLUE};text-decoration:none">{escape(link)}</a></p>
    </div>
  </div>

  <div style="padding:24px 4px 0;font-size:12px;line-height:1.7;color:{SOFT};text-align:left">
    <p style="margin:0 0 8px">Didn't expect this invitation? You can ignore this email. Nothing is created until you set a password.</p>
    <p style="margin:0">
      <span style="color:{MUTED};font-weight:600;letter-spacing:0.12em">ENVOY</span>
      &nbsp;·&nbsp; Transactional email on your own infrastructure
      &nbsp;·&nbsp; <a href="{safe_site}" style="color:{SOFT};text-decoration:underline">{escape(site_url.replace("https://", "").rstrip("/"))}</a>
    </p>
    <p style="margin:6px 0 0">Sent to {escape(recipient)}.</p>
  </div>

</div>
</body>
</html>"""
    return subject, text, html

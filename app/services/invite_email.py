"""Invitation email: header with the Envoy mark on the left, one action, footer."""

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
    expires: datetime,
    recipient: str,
    inviter: str | None,
    site_url: str,
) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    when = expires.strftime("%B %d, %Y at %H:%M UTC")
    who = inviter or "An Envoy administrator"
    subject = "You're invited to Envoy"

    text = (
        f"{who} invited you to Envoy.\n\n"
        "Envoy is the console your team uses to send transactional email "
        "from its own domains: password resets, receipts, alerts.\n\n"
        f"Activate your account and choose a password:\n{link}\n\n"
        f"The link works once and expires on {when}.\n\n"
        "Not expecting this invitation? Ignore this email. "
        "No account is created until a password is set.\n\n"
        f"— Envoy · {site_url}\n"
        f"Sent to {recipient}.\n"
    )

    safe_link = escape(link, quote=True)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:{FONT};color:{INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(who)} invited you to Envoy. Activate your account in one click.</div>
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <div style="padding:0 4px 20px;text-align:left">
    <a href="{escape(site_url, quote=True)}" style="text-decoration:none;color:{INK};display:inline-block">
      {_MARK}<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:15px;font-weight:600;letter-spacing:0.18em;color:{INK}">ENVOY</span>
    </a>
  </div>

  <div style="background:#ffffff;border:1px solid {LINE};border-radius:4px;padding:36px 32px">
    <p style="margin:0 0 14px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{BLUE}">&#9632; Invitation</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:{INK}">Join your team on Envoy</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{MUTED}">
      <strong style="color:{INK};font-weight:600">{escape(who)}</strong> invited you to the Envoy console.
      It's where your team sends transactional email from its own domains: password resets, receipts, alerts.
    </p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:{MUTED}">
      Activate your account and choose a password to get started.
    </p>
    <a href="{safe_link}" style="display:inline-block;background:{BLUE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:4px">Activate my account</a>
    <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:{MUTED}">
      This link works once and expires on <strong style="color:{INK};font-weight:600">{escape(when)}</strong>.
    </p>
    <div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid {LINE}">
      <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:{SOFT}">Button not working? Paste this address into your browser:</p>
      <p style="margin:0;font-family:{MONO};font-size:12px;line-height:1.6;word-break:break-all"><a href="{safe_link}" style="color:{BLUE};text-decoration:none">{escape(link)}</a></p>
    </div>
  </div>

  <div style="padding:24px 4px 0;font-size:12px;line-height:1.7;color:{SOFT};text-align:left">
    <p style="margin:0 0 8px">Not expecting this invitation? You can ignore this email. No account is created until a password is set.</p>
    <p style="margin:0">
      <span style="color:{MUTED};font-weight:600;letter-spacing:0.12em">ENVOY</span>
      &nbsp;·&nbsp; Transactional email on your own infrastructure
      &nbsp;·&nbsp; <a href="{escape(site_url, quote=True)}" style="color:{SOFT};text-decoration:underline">{escape(site_url.replace("https://", "").rstrip("/"))}</a>
    </p>
    <p style="margin:6px 0 0">Sent to {escape(recipient)}.</p>
  </div>

</div>
</body>
</html>"""
    return subject, text, html

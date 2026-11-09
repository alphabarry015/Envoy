"""Shared look for platform emails: Envoy mark on the left, white card, footer. No tables."""

from __future__ import annotations

from html import escape

BLUE = "#0A4BD6"
INK = "#0a0a0a"
MUTED = "#525252"
SOFT = "#a3a3a3"
LINE = "#e5e5e5"
FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

MARK = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 32 32" '
    'role="img" aria-label="Envoy" style="display:inline-block;vertical-align:middle">'
    f'<rect width="32" height="32" rx="4" fill="{BLUE}"/>'
    '<rect x="12" y="12" width="8" height="8" fill="#ffffff"/></svg>'
)


def one_line(value: str | None, limit: int = 80) -> str:
    return " ".join((value or "").split())[:limit]


def button(href: str, label: str, *, ghost: bool = False) -> str:
    if ghost:
        style = (
            f"display:inline-block;background:#ffffff;color:{INK};border:1px solid {LINE};"
            "text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:4px"
        )
    else:
        style = (
            f"display:inline-block;background:{BLUE};color:#ffffff;text-decoration:none;"
            "font-size:15px;font-weight:600;padding:13px 24px;border-radius:4px"
        )
    return f'<a href="{escape(href, quote=True)}" style="{style}">{escape(label)}</a>'


def paragraph(inner_html: str, *, size: int = 15, color: str = MUTED, margin: str = "0 0 14px") -> str:
    return f'<p style="margin:{margin};font-size:{size}px;line-height:1.65;color:{color}">{inner_html}</p>'


def field(label: str, value: str) -> str:
    """Label above value, stacked. Values are escaped here."""
    return (
        '<div style="margin:0 0 14px">'
        f'<p style="margin:0 0 4px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;'
        f'text-transform:uppercase;color:{SOFT}">{escape(label)}</p>'
        f'<p style="margin:0;font-size:15px;line-height:1.5;color:{INK};word-break:break-word">{escape(value)}</p>'
        "</div>"
    )


def render(
    *,
    title: str,
    preheader: str,
    kicker: str,
    heading: str,
    body_html: str,
    site_url: str,
    recipient: str,
    footer_note: str,
) -> str:
    safe_site = escape(site_url, quote=True)
    host = escape(site_url.replace("https://", "").replace("http://", "").rstrip("/"))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:{FONT};color:{INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(preheader)}</div>
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <div style="padding:0 4px 20px;text-align:left">
    <a href="{safe_site}" style="text-decoration:none;color:{INK};display:inline-block">
      {MARK}<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:15px;font-weight:600;letter-spacing:0.18em;color:{INK}">ENVOY</span>
    </a>
  </div>

  <div style="background:#ffffff;border:1px solid {LINE};border-radius:4px;padding:36px 32px">
    <p style="margin:0 0 14px;font-family:{MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{BLUE}">&#9632; {escape(kicker)}</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:{INK}">{escape(heading)}</h1>
{body_html}
  </div>

  <div style="padding:24px 4px 0;font-size:12px;line-height:1.7;color:{SOFT};text-align:left">
    <p style="margin:0 0 8px">{escape(footer_note)}</p>
    <p style="margin:0">
      <span style="color:{MUTED};font-weight:600;letter-spacing:0.12em">ENVOY</span>
      &nbsp;·&nbsp; Transactional email on your own infrastructure
      &nbsp;·&nbsp; <a href="{safe_site}" style="color:{SOFT};text-decoration:underline">{host}</a>
    </p>
    <p style="margin:6px 0 0">Sent to {escape(recipient)}.</p>
  </div>

</div>
</body>
</html>"""

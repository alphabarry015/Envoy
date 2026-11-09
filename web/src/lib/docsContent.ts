export type DocLang = "curl" | "python" | "node";

export type DocId =
  | "getting-started"
  | "authentication"
  | "api-keys"
  | "domains"
  | "sending"
  | "providers"
  | "templates"
  | "webhooks"
  | "realtime"
  | "security"
  | "errors";

export type DocBlock = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  rows?: Array<[string, string]>;
  code?: string;
};

export type DocSection = {
  title: string;
  kicker: string;
  lead: string;
  blocks: DocBlock[];
  bullets: string[];
};

export const DOC_NAV: Array<{ id: DocId; label: string }> = [
  { id: "getting-started", label: "Getting started" },
  { id: "authentication", label: "Authentication" },
  { id: "api-keys", label: "API keys" },
  { id: "domains", label: "Domains" },
  { id: "sending", label: "Sending" },
  { id: "providers", label: "Providers" },
  { id: "templates", label: "Templates" },
  { id: "webhooks", label: "Webhooks" },
  { id: "realtime", label: "Realtime" },
  { id: "security", label: "Security" },
  { id: "errors", label: "Errors and limits" },
];

export const DOC_SECTIONS: Record<DocId, DocSection> = {
  "getting-started": {
    kicker: "Getting started",
    title: "One API. Four sending tools. Your accounts.",
    lead: "Envoy is an HTTP API that sends transactional email through Amazon SES, Resend, Brevo or Mailtrap. Your app calls Envoy. Envoy checks the request, writes a log, picks a tool, and sends. Delivery results come back through webhooks.",
    blocks: [
      {
        heading: "How a send works",
        items: [
          "Your app calls POST /api/v1/send with an API key.",
          "Envoy checks the key, the sender domain, the suppression list and the quotas.",
          "Envoy writes a log row with status queued.",
          "Envoy sends through the first available tool. If it fails, the next tool takes over.",
          "The tool reports delivered, bounced or complained. Envoy updates the log and calls your webhook.",
        ],
      },
      {
        heading: "What you own",
        paragraphs: [
          "The AWS, Resend, Brevo and Mailtrap accounts stay yours. You pay them directly. Envoy stores users, domains, API keys, logs, templates, the suppression list and your webhook endpoints in Postgres.",
          "Receivers trust a message because of DNS, not because of the API. DKIM proves the domain signed the message. SPF lists the servers allowed to send for it. DMARC says what to do when those checks fail. Envoy gives you the records. You publish them at your DNS host.",
        ],
      },
      {
        heading: "First send in five steps",
        items: [
          "An admin invites you. Open the link, set a password (10+ characters), sign in.",
          "Console → Domains → add your domain and pick the tools that should send for it.",
          "Publish every DNS record shown. Wait for the status to turn verified.",
          "Console → API keys → create a live key with the send scope. Copy it now: it is shown once.",
          "Call POST /api/v1/send with Authorization: Bearer envoy_live_….",
        ],
      },
      {
        heading: "Health checks",
        rows: [
          ["GET /health", "Process is up. Does not touch the database. Returns {\"status\":\"ok\"}."],
          ["GET /ready", "Runs a query on Postgres. Returns {\"status\":\"ready\",\"database\":\"ok\"}."],
        ],
      },
    ],
    bullets: [
      "Base URL: https://<your-envoy-host>/api/v1",
      "Console: JWT from POST /auth/login",
      "Sending: Authorization: Bearer envoy_live_…",
      "All bodies are JSON, all times are UTC",
    ],
  },

  authentication: {
    kicker: "Authentication",
    title: "Two credentials. Never interchangeable.",
    lead: "The console uses a short-lived JWT. Sending uses an API key. Both go in Authorization: Bearer, but a key cannot open the console and a console token cannot call /send.",
    blocks: [
      {
        heading: "Sign in",
        paragraphs: [
          "POST /api/v1/auth/login with {email, password}. The answer is {access_token, token_type: \"bearer\", user}. The token lasts 60 minutes by default (ACCESS_TOKEN_EXPIRE_MINUTES).",
          "The JWT is signed with HS256. It carries sub (user id), iat, exp, role, email and tv (token version). Envoy checks all of them on every request, then reloads the user from the database.",
        ],
      },
      {
        heading: "Sessions can be revoked",
        paragraphs: [
          "Every account has a token version. A token is only valid while its tv claim matches the account. Raising the version kills every token issued before, on every device, at once.",
        ],
        items: [
          "POST /auth/password changes the password, revokes the other sessions and returns a new access_token for this device.",
          "POST /auth/sessions/revoke signs you out everywhere (204).",
          "POST /auth/users/{id}/sessions/revoke lets an admin sign out any account (204).",
          "Suspending a user or changing their role revokes their sessions automatically.",
        ],
      },
      {
        heading: "Brute-force protection",
        paragraphs: [
          "Failed logins are counted in the database, so the limit holds across all servers. After 5 failures in 15 minutes for one email, or 30 failures in 15 minutes from one IP, login returns 429 \"Too many attempts. Try again in a few minutes.\" A successful login resets the counter. Invite activation has the same IP limit.",
          "A wrong email and a wrong password take the same time and return the same 401 \"Invalid email or password.\" so accounts cannot be guessed.",
        ],
      },
      {
        heading: "Invites",
        paragraphs: [
          "There is no public sign-up and there is a single admin account. The admin calls POST /auth/invite with the email, quotas and the tool used to send the invite (ses, resend, brevo or mailtrap). The link expires after INVITE_TOKEN_EXPIRE_HOURS (48 by default) and works once.",
          "POST /auth/accept-invite with {token, password, password_confirm} activates the account and returns a session. Passwords need 10 to 72 bytes (bcrypt limit).",
          "Forgot password: POST /auth/password/forgot with {email} always answers 202 and, for an active account, emails a 6-digit code valid 15 minutes. POST /auth/password/verify-code checks {email, code}, then POST /auth/password/reset with {email, code, new_password, new_password_confirm} sets the password and signs out every session. Five wrong codes cancel the code.",
        ],
      },
      {
        heading: "Account routes",
        rows: [
          ["POST /auth/login", "Email + password → access_token"],
          ["GET /auth/me", "Current user"],
          ["PUT /auth/me/invite-settings", "Admin only. Reply-To for invitation emails"],
          ["POST /access-requests", "Public form. Stores the request and emails the reviewer"],
          ["GET /access-requests", "Admin only. Requests, waiting ones first"],
          ["POST /access-requests/{id}/accept", "Admin only. Sends the invitation, returns the code"],
          ["POST /access-requests/{id}/decline", "Admin only. notify: true emails the requester"],
          ["POST /auth/password", "Change password → new access_token"],
          ["POST /auth/sessions/revoke", "Sign out all my devices"],
          ["GET /auth/users", "Admin: list accounts"],
          ["PATCH /auth/users/{id}", "Admin: role, status, quotas, can_create_api_keys"],
          ["POST /auth/users/{id}/sessions/revoke", "Admin: sign out an account"],
          ["DELETE /auth/users/{id}", "Admin: cancel a pending invite or delete a suspended account"],
          ["POST /auth/invite", "Admin: send an invite"],
          ["POST /auth/accept-invite", "Activate an invite"],
          ["POST /auth/password/forgot", "Email a password reset code"],
          ["POST /auth/password/verify-code", "Check a reset code"],
          ["POST /auth/password/reset", "Set a new password with the code"],
        ],
      },
    ],
    bullets: [
      "401 = missing, expired or revoked token",
      "403 = admin route without admin role",
      "429 = too many failed logins",
      "Tokens live in sessionStorage, closed with the tab",
    ],
  },

  "api-keys": {
    kicker: "API keys",
    title: "Keys send mail. Nothing else.",
    lead: "An API key is the only credential accepted by POST /api/v1/send. It is created in the console, shown once, and stored as a SHA-256 hash.",
    blocks: [
      {
        heading: "Create a key",
        paragraphs: [
          "POST /api/v1/api-keys with a console token. The full key is in the response once. Envoy keeps only its SHA-256 hash and a short visible prefix. Lost keys cannot be recovered: create a new one.",
        ],
        rows: [
          ["name", "Label shown in the console"],
          ["mode", "live (sends for real) or sandbox (never calls a tool)"],
          ["scopes", "send, domains, logs. /send needs send"],
          ["daily_quota", "Optional cap per UTC day, ≥ 1"],
          ["monthly_quota", "Optional cap per UTC month, ≥ 1"],
          ["preferred_provider", "Optional: ses, resend, brevo or mailtrap. Tried first for this key"],
        ],
      },
      {
        heading: "Prefixes",
        items: [
          "envoy_live_… sends through a real tool.",
          "envoy_test_… is sandbox: the log is written as sent, nothing leaves Envoy.",
          "Any other value returns 401 \"API key required.\"",
        ],
      },
      {
        heading: "Quotas",
        paragraphs: [
          "Four limits apply together: account daily, account monthly, key daily, key monthly. Null means no cap. Envoy counts since midnight UTC or the first day of the month. Failed and suppressed attempts do not count.",
          "Quota checks take a database lock per account, so two parallel requests cannot both pass the last free slot. Over the limit: 429 \"Send quota exceeded.\"",
        ],
      },
      {
        heading: "Revoke",
        paragraphs: [
          "POST /api-keys/{id}/revoke disables a key and keeps it in the list. DELETE /api-keys/{id} removes it. Both apply to the very next request: there is no cache.",
        ],
      },
    ],
    bullets: [
      "Shown once, stored as SHA-256",
      "live → real send, sandbox → no send",
      "preferred_provider puts one tool first",
      "Admins can disable key creation per user",
    ],
  },

  domains: {
    kicker: "Domains",
    title: "A domain sends only once its DNS is verified.",
    lead: "Each domain is linked to one or more sending tools. Envoy creates the domain in each tool, collects their DNS records, and keeps both sides in sync.",
    blocks: [
      {
        heading: "Connect",
        paragraphs: [
          "POST /api/v1/domains with {\"name\":\"mail.acme.io\",\"providers\":[\"ses\",\"resend\"]}. The name is lowercased, the trailing dot removed, wildcards refused. providers defaults to [\"ses\"].",
          "For SES, Envoy generates a DKIM key pair (BYODKIM) and stores the private key encrypted. For Resend, Brevo and Mailtrap, Envoy calls their API to create the domain and copies their records.",
          "One domain belongs to one account. A second account gets 409. An account domain quota returns 403 when reached. A tool error returns 502 with the tool message.",
        ],
      },
      {
        heading: "DNS records",
        paragraphs: [
          "Each record has type, name, value, ttl (300), purpose (dkim, spf, dmarc, mx), status and source (the tool that needs it). Publish all of them. Records from different tools can live side by side.",
        ],
        items: [
          "DKIM: TXT or CNAME under ._domainkey. Proves the signature.",
          "SPF: TXT v=spf1 … on the domain or a bounce subdomain.",
          "DMARC: TXT at _dmarc.<domain>, starts with p=none. Tighten it later.",
          "MX: only when a tool needs a return-path subdomain.",
        ],
      },
      {
        heading: "Verify",
        paragraphs: [
          "GET /domains/{id}/verify asks every linked tool for its status and checks DNS live. The domain becomes verified when its tools report success. Until then it stays pending, or failed if a tool rejects it.",
        ],
      },
      {
        heading: "Two-way sync",
        paragraphs: [
          "Domains deleted directly in Resend, Brevo or Mailtrap are detached from Envoy. Resend pushes domain events instantly. Brevo and Mailtrap are checked when the domain list loads, and every 30 seconds while the page is open. Admins also see domains created directly in the tools.",
        ],
      },
      {
        heading: "Routes",
        rows: [
          ["GET /domains", "List your domains"],
          ["POST /domains", "Connect a domain (201)"],
          ["GET /domains/{id}", "One domain with its records"],
          ["GET /domains/{id}/verify", "Refresh status from tools and DNS"],
          ["PATCH /domains/{id}/providers", "Change the tools linked to the domain"],
          ["PUT /domains/{id}/sender", "Default sender and reply mode for the domain"],
          ["DELETE /domains/{id}", "Remove from Envoy (204)"],
        ],
      },
    ],
    bullets: [
      "providers: ses, resend, brevo, mailtrap",
      "Publish every record, from every tool",
      "verify = tools + live DNS check",
      "Another user's domain answers 404",
    ],
  },

  sending: {
    kicker: "Sending",
    title: "POST /send. Checked, logged, sent.",
    lead: "The send route takes an API key, validates the message, writes a log, and sends through the first working tool. The response carries Envoy's message_id.",
    blocks: [
      {
        heading: "Body",
        rows: [
          ["to", "Required. One address or a list"],
          ["subject", "Required. 1–998 characters, no line breaks"],
          ["html / text", "At least one is required"],
          ["from", "Optional. email or Name <email>, on a verified domain"],
          ["cc, bcc", "Optional. Address or list"],
          ["reply_to", "Optional. Up to 5 addresses"],
          ["attachments", "Up to 10 × {filename, content (Base64), content_type}"],
          ["tags", "Optional string map, stored with the log"],
        ],
      },
      {
        heading: "Limits",
        items: [
          "50 recipients max per message, to + cc + bcc together.",
          "Attachments: 3 MB total after Base64 decoding.",
          "Line breaks in subject or filenames are refused (header injection).",
          "content_type must look like type/subtype.",
        ],
      },
      {
        heading: "Sender rules",
        paragraphs: [
          "With from: the host must be a verified domain of your account, or a subdomain of one. The longest match wins. Otherwise 422 \"The from domain is not verified for this account.\"",
          "Without from: Envoy uses the domain's default sender (noreply@ unless you changed it in Sender & replies) on your most recently verified domain. Without reply_to: Envoy uses the domain's reply address if one is set, otherwise replies are not routed. With no verified domain, it uses the platform sender and puts your account email in reply_to.",
        ],
      },
      {
        heading: "Answer and status",
        items: [
          "202 {message_id, status}. status is queued, or sent when the send finished inside the request (serverless hosting).",
          "Sandbox key: 202 with status sent. No tool is called.",
          "A suppressed recipient: the log is written as suppressed, then 422 \"Suppressed recipients: …\". No quota used.",
          "Tool failure: the next tool is tried. If all fail, the log becomes failed with the error text.",
          "Later: delivered, bounced or complained arrive through the tool webhooks.",
        ],
      },
    ],
    bullets: [
      "202 accepted ≠ delivered",
      "50 recipients, 10 attachments, 3 MB",
      "422 unverified sender or suppressed address",
      "429 quota exceeded",
    ],
  },

  providers: {
    kicker: "Providers",
    title: "SES first. Then the next tool that works.",
    lead: "Envoy can send through Amazon SES, Resend, Brevo and Mailtrap. The order, the on/off switch and the limits are set by an admin in Console → Providers.",
    blocks: [
      {
        heading: "Routing",
        items: [
          "Default policy ses_first: SES when configured, then the fallback list (FALLBACK_EMAIL_PROVIDERS).",
          "A key with preferred_provider tries that tool first.",
          "A disabled or unconfigured tool is skipped.",
          "On error, Envoy moves to the next tool automatically. The log keeps the tool that actually sent.",
        ],
      },
      {
        heading: "Configuration",
        rows: [
          ["Amazon SES", "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_SES_CONFIGURATION_SET"],
          ["Resend", "RESEND_API_KEY, WEBHOOK_SECRET_RESEND (whsec_…)"],
          ["Brevo", "BREVO_API_KEY, WEBHOOK_SECRET_BREVO"],
          ["Mailtrap", "MAILTRAP_API_TOKEN, WEBHOOK_SECRET_MAILTRAP"],
        ],
      },
      {
        heading: "Provider pages",
        paragraphs: [
          "GET /providers shows each tool: connected or not, sends today and this month, and domain counts (linked in Envoy vs offered by the tool). Only admins see usage and domain numbers. GET /providers/{id} (admin) adds recent sends and the webhook link. POST /providers/{id}/webhook creates or repairs the tool webhook through its real API.",
        ],
      },
    ],
    bullets: [
      "Order and limits: PATCH /providers (admin)",
      "Failover is automatic",
      "Each tool needs its own webhook secret",
      "Usage numbers are admin-only",
    ],
  },

  templates: {
    kicker: "Templates",
    title: "Write once in HTML, CSS or the visual editor.",
    lead: "Templates hold the subject, sender, preview text and body of an email. Edit them visually with blocks, or switch to code and edit HTML and CSS side by side.",
    blocks: [
      {
        heading: "Two ways to edit",
        items: [
          "Visual editor: text, images, buttons, 2 to 4 columns, drag and drop. Based on React Email.",
          "Code: HTML and CSS files in a code editor with completion and validation. CSS is inlined on save so mail clients keep the styles.",
          "Gallery: start from a ready-made React Email layout and adapt it.",
        ],
      },
      {
        heading: "Variables",
        paragraphs: [
          "Write {{first_name}} in the subject or body. Each variable has a type (string, number, date) and a fallback used when no value is given. Names use letters, numbers and _ and cannot start with a number.",
        ],
      },
      {
        heading: "Fields",
        rows: [
          ["name", "Shown in the console, up to 160 characters"],
          ["alias", "Unique slug: lowercase letters, numbers, dashes"],
          ["subject, preview_text", "Up to 998 characters"],
          ["html, text", "Body. text is generated from html when empty"],
          ["from_name, from_email, reply_to", "Default sender"],
          ["status", "draft or published"],
          ["variables", "List of {name, type, fallback}"],
        ],
      },
      {
        heading: "Routes",
        rows: [
          ["GET /templates", "List"],
          ["POST /templates", "Create (201)"],
          ["GET /templates/{id}", "Read"],
          ["PUT /templates/{id}", "Save"],
          ["DELETE /templates/{id}", "Delete (204)"],
        ],
      },
    ],
    bullets: [
      "Visual blocks or raw HTML + CSS",
      "{{variable}} with typed fallbacks",
      "CSS is inlined for mail clients",
      "The code editor loads only when opened",
    ],
  },

  webhooks: {
    kicker: "Webhooks",
    title: "Envoy calls you. Signed, timestamped, once.",
    lead: "There are two directions. Tools (SES, Resend, Brevo, Mailtrap) call Envoy with delivery results. Envoy then calls the HTTPS endpoints you registered.",
    blocks: [
      {
        heading: "Your endpoints",
        paragraphs: [
          "POST /api/v1/webhooks with {name, url, events, providers?}. The URL must be https (http only on localhost in development). Private, loopback and cloud metadata addresses are refused. Up to 10 endpoints per account. The signing secret (whsec_…) is returned once.",
        ],
        rows: [
          ["email.sent", "A tool accepted the message"],
          ["email.delivered", "The receiving server accepted it"],
          ["email.bounced", "Rejected. Permanent bounces are suppressed"],
          ["email.complained", "Marked as spam. Always suppressed"],
          ["email.failed", "Every tool failed"],
          ["email.suppressed", "Blocked by the suppression list"],
        ],
      },
      {
        heading: "What you receive",
        rows: [
          ["X-Envoy-Event", "Event name, e.g. email.delivered"],
          ["X-Envoy-Delivery", "Unique id of this delivery (UUID)"],
          ["X-Envoy-Timestamp", "Unix seconds when Envoy signed it"],
          ["X-Envoy-Signature", "t=<timestamp>,v1=<hex HMAC-SHA256>"],
        ],
        code: `{"id":"<delivery uuid>","type":"email.delivered","created_at":"2026-11-08T21:00:00+00:00","data":{"email_id":"…","message_id":"…","provider":"ses"}}`,
      },
      {
        heading: "Verify every request",
        items: [
          "Read the raw body. Do not parse and re-serialize it.",
          "Compute HMAC-SHA256 with your secret over \"<t>.<raw body>\".",
          "Compare with v1 in constant time.",
          "Reject if |now − t| > 300 seconds. This blocks replays.",
          "Store X-Envoy-Delivery for 10 minutes and ignore duplicates.",
          "Answer 2xx within 4 seconds. Envoy does not follow redirects.",
        ],
      },
      {
        heading: "Manage endpoints",
        rows: [
          ["GET /webhooks", "List"],
          ["PATCH /webhooks/{id}", "Change name, url, events, providers"],
          ["POST /webhooks/{id}/status", "{active: true|false}"],
          ["POST /webhooks/{id}/rotate", "New secret, shown once"],
          ["DELETE /webhooks/{id}", "Remove (204)"],
        ],
      },
      {
        heading: "Incoming from tools",
        paragraphs: [
          "POST /webhooks/ses receives Amazon SNS. Envoy checks the SNS signature with the AWS certificate, the topic (SES_SNS_TOPIC_ARNS or your AWS account) and the age (1 hour). SubscriptionConfirmation is confirmed only on an official sns.<region>.amazonaws.com URL.",
          "POST /webhooks/resend, /brevo and /mailtrap check the tool signature or token. In production a missing secret refuses the call (503). Bad signatures get 401.",
        ],
      },
    ],
    bullets: [
      "Signature: t=…,v1=HMAC(secret, t.body)",
      "Reject older than 5 minutes",
      "Deduplicate on X-Envoy-Delivery",
      "Secrets are stored encrypted",
    ],
  },

  realtime: {
    kicker: "Realtime",
    title: "The console updates itself.",
    lead: "Domains, emails, logs and users refresh as soon as something changes, without reloading the page.",
    blocks: [
      {
        heading: "How it works",
        paragraphs: [
          "The browser opens a WebSocket to Supabase Realtime. The API publishes small events (ids only, no email content) on one topic per user. The topic name is an HMAC of the user id with the server secret, so nobody can guess another user's channel, and it is only given to that signed-in user.",
          "GET /api/v1/realtime/config (console token) returns {enabled, url, key, topic}. The connection retries with backoff up to 30 seconds and refreshes the page data after reconnecting.",
        ],
      },
      {
        heading: "Events",
        items: [
          "domains.changed: a domain was added, verified, removed or synced from a tool.",
          "emails.changed: a log changed status.",
          "users.changed: an invite was sent.",
          "realtime.ready: the connection came back. Pages reload their data.",
        ],
      },
      {
        heading: "Fallback",
        paragraphs: [
          "Pages that depend on tools without push events (Brevo, Mailtrap) also refresh every 30 seconds while the tab is visible.",
        ],
      },
    ],
    bullets: [
      "WebSocket via Supabase Realtime",
      "One hashed topic per user",
      "Payloads carry ids only",
      "Polling fallback every 30 s",
    ],
  },

  security: {
    kicker: "Security",
    title: "What Envoy does to keep your mail safe.",
    lead: "A summary of the protections in place. Useful for a security review or a customer questionnaire.",
    blocks: [
      {
        heading: "Secrets",
        items: [
          "Passwords: bcrypt, 10 to 72 bytes.",
          "API keys and invite tokens: SHA-256 hash only.",
          "Webhook secrets and DKIM private keys: encrypted with ENCRYPTION_KEY (Fernet). Old values sealed with SECRET_KEY are re-encrypted at startup.",
          "JWT: HS256 with SECRET_KEY, 60 minutes, revocable through the token version.",
        ],
      },
      {
        heading: "Network",
        items: [
          "Outgoing webhooks: https only, DNS resolved and checked, private/loopback/metadata IPs blocked, no redirects, 4 s timeout.",
          "Incoming webhooks: signatures checked for every tool. SNS certificates fetched only from AWS.",
          "CORS limited to the console origins. No cookies.",
          "Headers: HSTS, X-Frame-Options DENY, nosniff, strict referrer, CSP frame-ancestors none, no-store on API answers.",
        ],
      },
      {
        heading: "Accounts and data",
        items: [
          "No public sign-up. Invites only.",
          "Login throttling per email and per IP.",
          "Each user sees only their domains, keys, logs, templates and webhooks.",
          "Supabase Auth cannot grant roles: the role lives in app metadata, set by Envoy.",
          "Row level security on sensitive tables. API docs (/docs, /openapi.json) are off in production.",
        ],
      },
      {
        heading: "Required in production",
        rows: [
          ["APP_ENV", "production"],
          ["DEBUG", "false"],
          ["SECRET_KEY", "Random, 32+ characters. Signs JWTs"],
          ["ENCRYPTION_KEY", "Random, 32+ characters. Encrypts stored secrets"],
          ["WEBHOOK_SECRET_*", "One per tool you use"],
          ["CORS_ORIGINS", "Your console URLs only"],
        ],
      },
    ],
    bullets: [
      "bcrypt + SHA-256 + Fernet",
      "SSRF guard on outgoing calls",
      "Signed and timestamped webhooks",
      "Revocable sessions",
    ],
  },

  errors: {
    kicker: "Errors and limits",
    title: "Every error has a status and a detail.",
    lead: "Errors return JSON: {\"detail\": \"…\"}. Validation errors (422) return a list of fields with a message each.",
    blocks: [
      {
        heading: "Status codes",
        rows: [
          ["400", "Bad request: wrong invite token, wrong current password, bad SNS payload"],
          ["401", "Missing, expired or revoked token. Wrong API key. Bad webhook signature"],
          ["403", "Admin only, missing scope, domain quota reached, bad SNS signature"],
          ["404", "Not found, or owned by someone else"],
          ["409", "Already exists (domain, webhook URL, account)"],
          ["422", "Validation: unverified sender, suppressed recipient, field errors"],
          ["429", "Send quota exceeded, or too many login attempts"],
          ["502", "A sending tool returned an error"],
          ["503", "A webhook secret is missing in production"],
        ],
      },
      {
        heading: "Limits",
        rows: [
          ["Recipients", "50 per message (to + cc + bcc)"],
          ["Attachments", "10 files, 3 MB total"],
          ["reply_to", "5 addresses"],
          ["Subject", "998 characters, single line"],
          ["Webhook endpoints", "10 per account"],
          ["Login", "5 failures / 15 min per email, 30 per IP"],
          ["Session", "60 minutes"],
          ["Invite link", "48 hours, single use"],
        ],
      },
    ],
    bullets: [
      "Errors: {\"detail\": \"…\"}",
      "Retry 429 and 502 with backoff",
      "Never retry 4xx without changing the request",
      "202 means accepted, not delivered",
    ],
  },
};

const BASE = "https://envoy.example.com";

export const DOC_SAMPLES: Record<DocId, Record<DocLang, string>> = {
  "getting-started": {
    curl: `curl -sS ${BASE}/health
# {"status":"ok","service":"Envoy"}

curl -sS ${BASE}/ready
# {"status":"ready","database":"ok"}`,
    python: `import httpx

base = "${BASE}"
print(httpx.get(f"{base}/health", timeout=5).json())
print(httpx.get(f"{base}/ready", timeout=5).json())`,
    node: `const base = "${BASE}";
console.log(await (await fetch(\`\${base}/health\`)).json());
console.log(await (await fetch(\`\${base}/ready\`)).json());`,
  },
  authentication: {
    curl: `# Sign in
curl -sS -X POST ${BASE}/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"ops@acme.io","password":"your-password"}'

# Change password: returns a new token, other devices are signed out
curl -sS -X POST ${BASE}/api/v1/auth/password \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"current_password":"old","new_password":"new-long-pass","new_password_confirm":"new-long-pass"}'

# Sign out everywhere
curl -sS -X POST ${BASE}/api/v1/auth/sessions/revoke \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`,
    python: `import httpx

base = "${BASE}/api/v1"
login = httpx.post(f"{base}/auth/login", json={"email": "ops@acme.io", "password": "your-password"})
login.raise_for_status()
token = login.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

me = httpx.get(f"{base}/auth/me", headers=headers).json()
print(me["email"], me["role"])

# Sign out every device
httpx.post(f"{base}/auth/sessions/revoke", headers=headers)`,
    node: `const base = "${BASE}/api/v1";
const login = await fetch(\`\${base}/auth/login\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ops@acme.io", password: "your-password" }),
});
if (login.status === 429) throw new Error("Too many attempts, wait a few minutes");
const { access_token } = await login.json();

await fetch(\`\${base}/auth/sessions/revoke\`, {
  method: "POST",
  headers: { Authorization: \`Bearer \${access_token}\` },
});`,
  },
  "api-keys": {
    curl: `curl -sS -X POST ${BASE}/api/v1/api-keys \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Billing","mode":"live","scopes":["send"],"daily_quota":5000,"preferred_provider":"resend"}'
# 201 {"key":"envoy_live_…", ...}  ← copy it now

curl -sS -X POST ${BASE}/api/v1/api-keys/$KEY_ID/revoke \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`,
    python: `import httpx

headers = {"Authorization": f"Bearer {access_token}"}
created = httpx.post(
    "${BASE}/api/v1/api-keys",
    headers=headers,
    json={"name": "Billing", "mode": "sandbox", "scopes": ["send"]},
)
key = created.json()
print(key["key"])  # shown once`,
    node: `const res = await fetch("${BASE}/api/v1/api-keys", {
  method: "POST",
  headers: { Authorization: \`Bearer \${accessToken}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Billing", mode: "live", scopes: ["send"], monthly_quota: 100000 }),
});
const key = await res.json();
console.log(key.key); // shown once`,
  },
  domains: {
    curl: `curl -sS -X POST ${BASE}/api/v1/domains \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"mail.acme.io","providers":["ses","resend"]}'

# After publishing DNS:
curl -sS ${BASE}/api/v1/domains/$DOMAIN_ID/verify \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`,
    python: `import httpx, time

headers = {"Authorization": f"Bearer {access_token}"}
domain = httpx.post(
    "${BASE}/api/v1/domains",
    headers=headers,
    json={"name": "mail.acme.io", "providers": ["ses", "brevo"]},
).json()

for r in domain["dns_records"]:
    print(r["source"], r["purpose"], r["type"], r["name"], r["value"])

while True:
    status = httpx.get(f"${BASE}/api/v1/domains/{domain['id']}/verify", headers=headers).json()
    if status["verified"]:
        break
    time.sleep(60)`,
    node: `const headers = { Authorization: \`Bearer \${accessToken}\`, "Content-Type": "application/json" };
const domain = await (await fetch("${BASE}/api/v1/domains", {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "mail.acme.io", providers: ["ses"] }),
})).json();

for (const r of domain.dns_records) console.log(r.purpose, r.type, r.name, r.value);`,
  },
  sending: {
    curl: `curl -sS -X POST ${BASE}/api/v1/send \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Acme <billing@mail.acme.io>",
    "to": ["client@example.com"],
    "subject": "Invoice 2048",
    "html": "<p>Your invoice is paid.</p>",
    "text": "Your invoice is paid.",
    "reply_to": "support@acme.io",
    "tags": {"invoice": "2048"}
  }'
# 202 {"message_id":"…","status":"queued"}`,
    python: `import base64, httpx

pdf = base64.b64encode(open("invoice.pdf", "rb").read()).decode()
r = httpx.post(
    "${BASE}/api/v1/send",
    headers={"Authorization": "Bearer envoy_live_…"},
    json={
        "from": "Acme <billing@mail.acme.io>",
        "to": ["client@example.com"],
        "subject": "Invoice 2048",
        "html": "<p>Your invoice is attached.</p>",
        "attachments": [{"filename": "invoice.pdf", "content": pdf, "content_type": "application/pdf"}],
    },
    timeout=30,
)
if r.status_code == 429:
    print("Quota reached")
print(r.status_code, r.json())`,
    node: `const res = await fetch("${BASE}/api/v1/send", {
  method: "POST",
  headers: { Authorization: "Bearer envoy_live_…", "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "Acme <billing@mail.acme.io>",
    to: ["client@example.com"],
    subject: "Invoice 2048",
    html: "<p>Your invoice is paid.</p>",
  }),
});
// 202 { message_id, status }
console.log(res.status, await res.json());`,
  },
  providers: {
    curl: `# Admin token
curl -sS ${BASE}/api/v1/providers \\
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Create or repair the Resend webhook
curl -sS -X POST ${BASE}/api/v1/providers/resend/webhook \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`,
    python: `import httpx

headers = {"Authorization": f"Bearer {admin_token}"}
data = httpx.get("${BASE}/api/v1/providers", headers=headers).json()
for p in data["items"]:
    print(p["id"], p["connected"], p["domains"])`,
    node: `const res = await fetch("${BASE}/api/v1/providers", {
  headers: { Authorization: \`Bearer \${adminToken}\` },
});
const { items } = await res.json();
for (const p of items) console.log(p.id, p.connected, p.usage);`,
  },
  templates: {
    curl: `curl -sS -X POST ${BASE}/api/v1/templates \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Welcome",
    "alias": "welcome",
    "subject": "Welcome, {{first_name}}",
    "html": "<h1>Hi {{first_name}}</h1>",
    "variables": [{"name": "first_name", "type": "string", "fallback": "there"}]
  }'`,
    python: `import httpx

headers = {"Authorization": f"Bearer {access_token}"}
tpl = httpx.post(
    "${BASE}/api/v1/templates",
    headers=headers,
    json={
        "name": "Welcome",
        "alias": "welcome",
        "subject": "Welcome, {{first_name}}",
        "html": "<h1>Hi {{first_name}}</h1>",
        "status": "published",
        "variables": [{"name": "first_name", "type": "string", "fallback": "there"}],
    },
).json()
print(tpl["id"])`,
    node: `const tpl = await (await fetch("${BASE}/api/v1/templates", {
  method: "POST",
  headers: { Authorization: \`Bearer \${accessToken}\`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Welcome",
    alias: "welcome",
    subject: "Welcome, {{first_name}}",
    html: "<h1>Hi {{first_name}}</h1>",
  }),
})).json();`,
  },
  webhooks: {
    curl: `# Register an endpoint (console token)
curl -sS -X POST ${BASE}/api/v1/webhooks \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"App","url":"https://app.acme.io/hooks/envoy","events":["email.delivered","email.bounced"]}'
# 201 {..., "secret":"whsec_…"}  ← shown once

# Check a signature by hand
BODY='{"id":"…","type":"email.delivered",...}'
T=1762639200
printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$WHSEC"`,
    python: `import hashlib, hmac, time

SEEN: dict[str, float] = {}

def verify(secret: str, header: str, raw_body: bytes, delivery_id: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    t = parts.get("t", "")
    if not t.isdigit() or abs(time.time() - int(t)) > 300:
        return False  # too old: replay
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")):
        return False
    if delivery_id in SEEN:
        return False  # duplicate
    SEEN[delivery_id] = time.time()
    return True

# Flask / FastAPI:
# ok = verify(WHSEC, request.headers["X-Envoy-Signature"], raw_body,
#             request.headers["X-Envoy-Delivery"])`,
    node: `import crypto from "node:crypto";

const seen = new Map();

export function verify(secret, header, rawBody, deliveryId) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const given = String(parts.v1 ?? "");
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return false;
  if (seen.has(deliveryId)) return false;
  seen.set(deliveryId, Date.now());
  return true;
}

// Express: app.post("/hooks/envoy", express.raw({ type: "application/json" }), (req, res) => {
//   const ok = verify(WHSEC, req.get("X-Envoy-Signature"), req.body.toString("utf8"), req.get("X-Envoy-Delivery"));
//   res.sendStatus(ok ? 200 : 401);
// });`,
  },
  realtime: {
    curl: `curl -sS ${BASE}/api/v1/realtime/config \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
# {"enabled":true,"url":"https://…supabase…","key":"<anon key>","topic":"envoy-…"}`,
    python: `import asyncio, json, httpx, websockets

cfg = httpx.get("${BASE}/api/v1/realtime/config",
                headers={"Authorization": f"Bearer {access_token}"}).json()
url = cfg["url"].replace("https", "wss") + f"/realtime/v1/websocket?apikey={cfg['key']}&vsn=1.0.0"

async def main():
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"topic": f"realtime:{cfg['topic']}", "event": "phx_join",
                                  "payload": {"config": {"broadcast": {"self": False}}}, "ref": "1"}))
        async for message in ws:
            print(message)

asyncio.run(main())`,
    node: `const cfg = await (await fetch("${BASE}/api/v1/realtime/config", {
  headers: { Authorization: \`Bearer \${accessToken}\` },
})).json();
const ws = new WebSocket(\`\${cfg.url.replace("https", "wss")}/realtime/v1/websocket?apikey=\${cfg.key}&vsn=1.0.0\`);
ws.onopen = () => ws.send(JSON.stringify({
  topic: \`realtime:\${cfg.topic}\`, event: "phx_join",
  payload: { config: { broadcast: { self: false } } }, ref: "1",
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));`,
  },
  security: {
    curl: `# Generate SECRET_KEY and ENCRYPTION_KEY (two different values)
python -c "import secrets; print(secrets.token_urlsafe(64))"
python -c "import secrets; print(secrets.token_urlsafe(64))"

# Check the security headers
curl -sSI ${BASE}/health | grep -iE "strict-transport|x-frame|x-content-type"`,
    python: `import secrets

print("SECRET_KEY=" + secrets.token_urlsafe(64))
print("ENCRYPTION_KEY=" + secrets.token_urlsafe(64))`,
    node: `import crypto from "node:crypto";

console.log("SECRET_KEY=" + crypto.randomBytes(48).toString("base64url"));
console.log("ENCRYPTION_KEY=" + crypto.randomBytes(48).toString("base64url"));`,
  },
  errors: {
    curl: `curl -sS -X POST ${BASE}/api/v1/send \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"to":["a@acme.io"],"subject":"Hi"}'
# 422 {"detail":[{"msg":"Value error, Either html or text must be provided", ...}]}`,
    python: `import time, httpx

def send(payload, key, attempts=4):
    for i in range(attempts):
        r = httpx.post("${BASE}/api/v1/send",
                       headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=30)
        if r.status_code in (429, 502, 503):
            time.sleep(2 ** i)
            continue
        return r
    return r`,
    node: `async function send(payload, key, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch("${BASE}/api/v1/send", {
      method: "POST",
      headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (![429, 502, 503].includes(res.status)) return res;
    await new Promise((r) => setTimeout(r, 2 ** i * 1000));
  }
}`,
  },
};

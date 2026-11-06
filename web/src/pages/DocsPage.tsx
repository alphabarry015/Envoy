import { ArrowLeft, Menu, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Link } from "react-router-dom";

type Lang = "curl" | "python" | "node";
type DocId =
  | "getting-started"
  | "authentication"
  | "domains"
  | "sending"
  | "webhooks";

const NAV: Array<{ id: DocId; label: string }> = [
  { id: "getting-started", label: "Getting Started" },
  { id: "authentication", label: "Authentication" },
  { id: "domains", label: "Domains API" },
  { id: "sending", label: "Sending API" },
  { id: "webhooks", label: "Webhooks" },
];

type DocBlock = { heading: string; paragraphs: string[] };

const SECTIONS: Record<
  DocId,
  { title: string; kicker: string; lead: string; blocks: DocBlock[]; bullets: string[] }
> = {
  "getting-started": {
    title: "Send mail through your own SES account.",
    kicker: "Getting started",
    lead: "Envoy is the HTTP API in front of Amazon SES. Your application talks to Envoy. Envoy checks the request, stores the attempt, then SES delivers the message. You host Envoy. You pay AWS for the mail.",
    blocks: [
      {
        heading: "What stays yours",
        paragraphs: [
          "The SES account, the domain identities, and the AWS bill stay in your account. Envoy does not resell sending capacity. It keeps the workspace data in Postgres: users, domains, API keys, send logs, the suppression list, and the webhook endpoints you configure.",
          "A receiver decides whether to trust a message by looking at DNS, not at the HTTP API. DKIM proves the message was signed by a key published for that domain. SPF says which servers may send for the domain. DMARC tells receivers what to do when those checks fail. Envoy returns the records. You publish them at your DNS host.",
        ],
      },
      {
        heading: "From an empty stack to the first send",
        paragraphs: [
          "Run Postgres and the API with AWS credentials for SES v2. There is no public sign-up. An administrator invites a member. That person sets a password from the invite link and signs in to the console.",
          "Create an API key in the console. Connect a domain. Publish the DNS records Envoy returns. Call GET /api/v1/domains/{id}/verify until SES reports DKIM SUCCESS. The domain status becomes verified. POST /api/v1/send can then use an address on that domain.",
        ],
      },
      {
        heading: "Two checks before you send",
        paragraphs: [
          "GET /health only proves the process is up. It returns {\"status\":\"ok\"}. It does not touch the database.",
          "GET /ready runs SELECT 1. It returns {\"status\":\"ready\",\"database\":\"ok\"} when Postgres accepts a query. Use /health for a process check and /ready before you send traffic.",
        ],
      },
    ],
    bullets: [
      "API base: https://mail.your-stack.tld/api/v1",
      "Console session: JWT from POST /api/v1/auth/login",
      "Sending: Authorization: Bearer envoy_live_…",
      "A live send answers 202 with message_id and status queued",
    ],
  },
  authentication: {
    title: "Two credentials. They are not interchangeable.",
    kicker: "Authentication",
    lead: "The console uses a JWT. Sending uses an API key. Both travel as Authorization: Bearer, but a key cannot open the console and a login token cannot call POST /api/v1/send.",
    blocks: [
      {
        heading: "Console session",
        paragraphs: [
          "POST /api/v1/auth/login takes email and password. The response is access_token, token_type bearer, and the user object. The token is a JWT signed with the server secret. It carries sub (the user id), iat, and exp.",
          "Domains, API keys, workspace webhooks, logs, and the suppression list all require this JWT. A missing token, a bad signature, or an inactive user returns 401 with detail \"Not authenticated.\" or \"Invalid or expired token.\" Admin routes also require is_admin and return 403 otherwise.",
        ],
      },
      {
        heading: "API keys",
        paragraphs: [
          "A key is created in the console. The full secret is returned once. Envoy stores only the SHA-256 hex digest and a short visible prefix. Later requests are checked with a constant-time compare of that digest. The plaintext is not recoverable.",
          "A live key starts with envoy_live_. A sandbox key starts with envoy_test_. Anything else is rejected as \"API key required.\" Revoke or delete takes effect on the next request. There is no cache to wait out.",
        ],
      },
      {
        heading: "Scopes and quotas",
        paragraphs: [
          "A key has one or more scopes: send, domains, logs. POST /api/v1/send requires the send scope. A key without it returns 403, \"This API key cannot send email.\"",
          "Four limits can apply at once: the account daily quota, the account monthly quota, the key daily quota, and the key monthly quota. A null limit means no cap. Envoy counts sends since midnight UTC, or since the first day of the month. Failed and suppressed attempts are not counted. Crossing a limit returns 429, \"Send quota exceeded.\" Changing a quota does not require a restart.",
        ],
      },
    ],
    bullets: [
      "POST /api/v1/auth/login → access_token",
      "Live prefix envoy_live_, sandbox prefix envoy_test_",
      "Stored form: SHA-256, secret shown once",
      "401 invalid credential, 403 missing scope, 429 quota",
    ],
  },
  domains: {
    title: "A domain can send only after DKIM succeeds.",
    kicker: "Domains API",
    lead: "SES will not sign mail for a domain it does not know. Envoy connects that identity to your workspace and tells you which DNS records to publish. These routes use the console JWT, not an API key.",
    blocks: [
      {
        heading: "Connect",
        paragraphs: [
          "POST /api/v1/domains with {\"name\":\"mail.acme.io\"}. The name is lowercased, a trailing dot is removed, and a wildcard is rejected. The response is 201.",
          "If SES already has the identity, Envoy links it and reads its current DKIM state. If it does not, Envoy generates a BYODKIM key pair, creates the identity in SES, and stores the private key encrypted. The public key is what you publish in DNS. The same domain cannot be connected to two accounts: the second attempt returns 409.",
          "A domain quota on the account, when set, returns 403 once it is reached. An AWS error returns 502 with the SES message.",
        ],
      },
      {
        heading: "The records you publish",
        paragraphs: [
          "Each record has type, name, value, ttl (300), purpose, and status. Purpose is DKIM, SPF, or DMARC.",
          "DKIM for a new identity is a TXT at envoy._domainkey.mail.acme.io. The value is the public key SES must find before it will report SUCCESS. An identity that already used Easy DKIM may instead list CNAME records pointing at dkim.amazonses.com.",
          "SPF is a TXT on the domain itself: v=spf1 include:amazonses.com ~all. That authorizes Amazon's servers. The soft fail (~all) marks other servers as suspicious without a hard reject.",
          "DMARC is a TXT at _dmarc.mail.acme.io: v=DMARC1; p=none;. p=none asks receivers to report failure and still deliver. Tighten the policy at your DNS host when the reports look clean. Envoy does not change that record for you.",
        ],
      },
      {
        heading: "Verify and remove",
        paragraphs: [
          "DNS publication is not instant, and SES checks on its own schedule. GET /api/v1/domains/{id}/verify reads the identity from SES and rewrites status. DKIM SUCCESS sets status to verified and verified to true. FAILED sets status to failed. Anything else stays pending.",
          "GET /api/v1/domains lists the workspace. GET /api/v1/domains/{id} returns one domain. A domain you do not own returns 404.",
          "DELETE /api/v1/domains/{id} returns 204 and removes the row from Envoy. The SES identity is left in AWS. You can connect the same name again later.",
        ],
      },
    ],
    bullets: [
      "POST /api/v1/domains — connect, 201",
      "GET /api/v1/domains/{id}/verify — refresh DKIM from SES",
      "verified only when dkim_status is SUCCESS",
      "DELETE removes the Envoy row, not the SES identity",
    ],
  },
  sending: {
    title: "The API accepts the message before SES sends it.",
    kicker: "Sending API",
    lead: "POST /api/v1/send is the only route that takes an API key. Envoy decides whether the message is allowed, writes a log row, and answers. The call to SES happens after that answer, on a live key.",
    blocks: [
      {
        heading: "The body",
        paragraphs: [
          "Required: to and subject. Also provide html, text, or both. A body with neither is rejected. to, cc, bcc, and reply_to accept one address or a list. from accepts a bare address or Name <email@domain>. The address is checked and lowercased. A display name that contains a comma or a bracket is quoted.",
          "If you omit from, Envoy uses noreply@ on your most recently verified domain. With no verified domain, it uses the platform sender and sets reply_to to your account email when you did not set one.",
          "If you set from, the host must be a verified domain on your account, or a subdomain of one. The longest matching domain wins. Otherwise the API returns 422, \"The from domain is not verified for this account.\"",
          "attachments is a list of {filename, content, content_type}. content is standard Base64. Each file and the total of all files must stay under 10 MB. tags is a string-to-string map stored with the request. It is not an SES message tag.",
        ],
      },
      {
        heading: "What the status means",
        paragraphs: [
          "A live key that passes every check returns 202 with {\"message_id\":\"<uuid>\",\"status\":\"queued\"}. message_id is Envoy's id. The SES id arrives later and is stored as ses_message_id. The HTTP handler returns before SES is called, so a 202 means accepted, not delivered.",
          "A sandbox key (envoy_test_) never calls SES. The log is marked sent and the same 202 shape comes back with status sent. Use it to exercise your client without touching the domain reputation.",
          "If any recipient in to, cc, or bcc is on the suppression list, Envoy still writes the log as suppressed, then returns 422, \"Suppressed recipients: …\". SES is not called. That attempt does not consume quota.",
        ],
      },
      {
        heading: "After the response",
        paragraphs: [
          "For a queued send, a background task calls SES v2. Success sets the log to sent and stores the SES message id. An SES error sets the log to failed and keeps the error text, truncated to 1000 characters. Delivery, bounce, and complaint are not known at this step. They arrive later on the SNS webhook.",
          "An inactive account returns 401. A key without the send scope returns 403. A quota breach returns 429.",
        ],
      },
    ],
    bullets: [
      "202 { message_id, status } — queued on live, sent on sandbox",
      "422 unverified from-domain, or a suppressed recipient",
      "429 when an account or key quota is exceeded",
      "html or text is required; attachments are Base64, 10 MB max",
    ],
  },
  webhooks: {
    title: "SES reports the outcome. Envoy records it.",
    kicker: "Webhooks",
    lead: "There are two webhook paths. Amazon SNS calls Envoy about delivery. Envoy can also call an HTTPS endpoint that you own. They solve different problems and they are authenticated differently.",
    blocks: [
      {
        heading: "The SES endpoint",
        paragraphs: [
          "POST /api/v1/webhooks/ses takes the raw SNS envelope. It has no Bearer token. SNS is the caller. The body must include Type and MessageId. A body that does not parse returns 400, \"Invalid SNS payload\".",
          "Type SubscriptionConfirmation is how SNS proves the subscription. Envoy GETs SubscribeURL only when that URL is https and the host ends with .amazonaws.com. Any other host is rejected. A successful confirm returns {\"status\":\"subscription_confirmed\"}.",
          "Type Notification carries the SES event in Message, usually a JSON string. Envoy reads notificationType or eventType. Delivery, Bounce, Complaint, and Reject update the log row whose ses_message_id matches mail.messageId. The log becomes delivered, bounced, complained, or failed.",
          "A bounce is suppressed only when bounceType is Permanent. A transient bounce updates the log and leaves the address sendable. A complaint is always suppressed. The address is inserted once. A second event for the same address does nothing. UnsubscribeConfirmation is acknowledged and ignored.",
        ],
      },
      {
        heading: "Your endpoint",
        paragraphs: [
          "The console, with a JWT, can register POST /api/v1/webhooks. The body is name, url, and events. The URL must be https, except http on localhost. The secret is returned once on create, the same way an API key is. Rotate it when you need a new one. DELETE removes the endpoint. A status update turns it on or off.",
          "Events you can subscribe to: email.sent, email.delivered, email.bounced, email.complained, email.failed, email.suppressed. Envoy emits them after the matching log change. The payload includes email_id and message_id or ses_message_id, depending on the event. This is how your application learns the outcome without polling SES.",
        ],
      },
      {
        heading: "How to point SES at Envoy",
        paragraphs: [
          "In SES, add an event destination for Delivery, Bounce, Complaint, and Reject on the configuration set you send with. Set the destination to an SNS topic. Subscribe that topic to https://mail.your-stack.tld/api/v1/webhooks/ses using the HTTPS protocol.",
          "SNS sends SubscriptionConfirmation first. Envoy confirms it. Only then do delivery events arrive. Until that handshake succeeds, logs stay at sent and the suppression list does not grow.",
        ],
      },
    ],
    bullets: [
      "POST /api/v1/webhooks/ses — SNS, no API key",
      "SubscribeURL must be https and end with .amazonaws.com",
      "Permanent bounce and complaint are suppressed",
      "Your HTTPS endpoint is a separate resource, created with a JWT",
    ],
  },
};

const SAMPLES: Record<DocId, Record<Lang, string>> = {
  "getting-started": {
    curl: `curl -sS https://mail.acme.io/health
# {"status":"ok","service":"Envoy"}

curl -sS https://mail.acme.io/ready
# {"status":"ready","database":"ok"}`,
    python: `import httpx

base = "https://mail.acme.io"
health = httpx.get(f"{base}/health", timeout=5)
ready = httpx.get(f"{base}/ready", timeout=5)
print(health.json())
print(ready.json())`,
    node: `const base = "https://mail.acme.io";
const health = await fetch(\`\${base}/health\`);
const ready = await fetch(\`\${base}/ready\`);
console.log(await health.json());
console.log(await ready.json());`,
  },
  authentication: {
    curl: `# Console session. This token calls /domains, not /send.
curl -sS -X POST https://mail.acme.io/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"ops@acme.io","password":"your-password"}'

# Sending key. Scope must include send.
curl -sS -X POST https://mail.acme.io/api/v1/send \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"from":"hello@mail.acme.io","to":["a@acme.io"],"subject":"Hi","text":"Hi"}'`,
    python: `import httpx

base = "https://mail.acme.io"
login = httpx.post(
    f"{base}/api/v1/auth/login",
    json={"email": "ops@acme.io", "password": "your-password"},
)
token = login.json()["access_token"]

sent = httpx.post(
    f"{base}/api/v1/send",
    headers={"Authorization": "Bearer envoy_live_…"},
    json={
        "from": "hello@mail.acme.io",
        "to": ["a@acme.io"],
        "subject": "Hi",
        "text": "Hi",
    },
)
print(login.status_code, sent.status_code)`,
    node: `const base = "https://mail.acme.io";
const login = await fetch(\`\${base}/api/v1/auth/login\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ops@acme.io", password: "your-password" }),
});
const { access_token } = await login.json();

const sent = await fetch(\`\${base}/api/v1/send\`, {
  method: "POST",
  headers: {
    Authorization: "Bearer envoy_live_…",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "hello@mail.acme.io",
    to: ["a@acme.io"],
    subject: "Hi",
    text: "Hi",
  }),
});
console.log(access_token ? "session ok" : "no session", sent.status);`,
  },
  domains: {
    curl: `curl -sS -X POST https://mail.acme.io/api/v1/domains \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"mail.acme.io"}'

# Then, after DNS is published:
curl -sS https://mail.acme.io/api/v1/domains/$DOMAIN_ID/verify \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
# {"verified":false,"dkim_status":"PENDING","status":"pending", ...}`,
    python: `import httpx

headers = {"Authorization": f"Bearer {access_token}"}
created = httpx.post(
    "https://mail.acme.io/api/v1/domains",
    headers=headers,
    json={"name": "mail.acme.io"},
)
domain = created.json()
for record in domain["dns_records"]:
    print(record["purpose"], record["type"], record["name"], record["value"])

verified = httpx.get(
    f"https://mail.acme.io/api/v1/domains/{domain['id']}/verify",
    headers=headers,
)
print(verified.json()["dkim_status"], verified.json()["verified"])`,
    node: `const headers = { Authorization: \`Bearer \${accessToken}\`, "Content-Type": "application/json" };
const created = await fetch("https://mail.acme.io/api/v1/domains", {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "mail.acme.io" }),
});
const domain = await created.json();
for (const record of domain.dns_records) {
  console.log(record.purpose, record.type, record.name, record.value);
}

const verified = await fetch(
  \`https://mail.acme.io/api/v1/domains/\${domain.id}/verify\`,
  { headers },
);
console.log(await verified.json());`,
  },
  sending: {
    curl: `curl -sS -X POST https://mail.acme.io/api/v1/send \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from":"Envoy <hello@mail.acme.io>",
    "to":["ops@acme.io"],
    "subject":"Invoice 2048",
    "html":"<p>Paid.</p>",
    "text":"Invoice 2048 is paid."
  }'
# 202 {"message_id":"…","status":"queued"}`,
    python: `import httpx

r = httpx.post(
    "https://mail.acme.io/api/v1/send",
    headers={"Authorization": "Bearer envoy_live_…"},
    json={
        "from": "Envoy <hello@mail.acme.io>",
        "to": ["ops@acme.io"],
        "subject": "Invoice 2048",
        "html": "<p>Paid.</p>",
        "text": "Invoice 2048 is paid.",
    },
)
# 202 {"message_id": "…", "status": "queued"}
print(r.status_code, r.json())`,
    node: `const res = await fetch("https://mail.acme.io/api/v1/send", {
  method: "POST",
  headers: {
    Authorization: "Bearer envoy_live_…",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "Envoy <hello@mail.acme.io>",
    to: ["ops@acme.io"],
    subject: "Invoice 2048",
    html: "<p>Paid.</p>",
    text: "Invoice 2048 is paid.",
  }),
});
// 202 { message_id, status: "queued" }
console.log(res.status, await res.json());`,
  },
  webhooks: {
    curl: `curl -sS -X POST https://mail.acme.io/api/v1/webhooks/ses \\
  -H "Content-Type: application/json" \\
  -d '{"Type":"Notification","Message":"{\\"eventType\\":\\"Bounce\\"}"}'`,
    python: `import httpx, json

r = httpx.post(
    "https://mail.acme.io/api/v1/webhooks/ses",
    json={"Type": "Notification", "Message": json.dumps({"eventType": "Bounce"})},
)
print(r.json())`,
    node: `const res = await fetch("https://mail.acme.io/api/v1/webhooks/ses", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    Type: "Notification",
    Message: JSON.stringify({ eventType: "Bounce" }),
  }),
});
console.log(await res.json());`,
  },
};

const LANGS: Array<{ id: Lang; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python httpx" },
  { id: "node", label: "Node.js fetch" },
];

const HANDLE =
  "relative w-1.5 shrink-0 bg-white/10 transition-colors outline-none hover:bg-white/35 focus-visible:bg-white/40 data-[separator]:bg-white/10 data-[separator][data-active]:bg-white/45";

export default function DocsPage() {
  const [section, setSection] = useState<DocId>("getting-started");
  const [lang, setLang] = useState<Lang>("curl");
  const [menuOpen, setMenuOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const content = SECTIONS[section];
  const sample = useMemo(() => SAMPLES[section][lang], [section, lang]);
  const sectionLabel = NAV.find((item) => item.id === section)?.label ?? "Docs";

  const nav = (
    <aside className="flex h-full min-h-0 flex-col bg-white/5 px-4 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-8">
      <Link
        to="/"
        className="group mb-6 flex shrink-0 items-center overflow-hidden rounded-sm border border-white/10 px-3 py-2.5 transition-colors hover:border-white/25 hover:bg-white/10"
      >
        <span className="relative flex min-h-5 w-full items-center">
          <span className="flex items-center gap-2.5 transition-all duration-200 group-hover:-translate-y-full group-hover:opacity-0">
            <span className="inline-block size-2 shrink-0 bg-white" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-[0.18em] text-white">ENVOY</span>
          </span>
          <span className="absolute inset-0 flex translate-y-full items-center gap-2 text-sm font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            Retour
          </span>
        </span>
      </Link>

      <p className="mb-4 shrink-0 font-mono text-[11px] tracking-widest text-white/45 uppercase">
        Documentation
      </p>
      <nav aria-label="Docs" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              setMenuOpen(false);
              setSamplesOpen(false);
            }}
            className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition-colors ${
              section === item.id
                ? "bg-white text-[#0A4BD6]"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );

  const article = (
    <article className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-5 md:px-10 md:py-12 lg:px-12">
      <p className="mb-4 font-mono text-xs tracking-widest text-white/50 uppercase">
        <span aria-hidden="true">■ </span>
        {content.kicker}
      </p>
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
        {content.title}
      </h1>
      <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/80">{content.lead}</p>
      <div className="mt-10 max-w-3xl space-y-10">
        {content.blocks.map((block) => (
          <section key={block.heading}>
            <h2 className="text-lg font-semibold tracking-tight text-white md:text-xl">
              {block.heading}
            </h2>
            <div className="mt-3 space-y-4 text-base leading-relaxed text-white/70">
              {block.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ul className="mt-8 max-w-3xl space-y-2">
        {content.bullets.map((bullet) => (
          <li
            key={bullet}
            className="rounded-sm border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-[#9ec4ff]"
          >
            {bullet}
          </li>
        ))}
      </ul>
    </article>
  );

  const samples = (
    <aside className="flex min-h-0 flex-col overflow-hidden bg-white/5 lg:h-full">
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 p-3">
        {LANGS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLang(item.id)}
            className={`rounded-sm px-3 py-1.5 text-xs transition-colors ${
              lang === item.id
                ? "bg-white text-[#0A4BD6]"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-4 py-5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#9ec4ff] sm:px-5">
        <code>{sample}</code>
      </pre>
    </aside>
  );

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white">
      <div className="relative z-10 flex h-full min-h-0 flex-col lg:hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-sm border border-white/15 text-white"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span className="sr-only">Open documentation menu</span>
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{sectionLabel}</p>
          <button
            type="button"
            className="rounded-sm border border-white/15 px-3 py-2 text-xs font-medium text-white"
            aria-pressed={samplesOpen}
            onClick={() => setSamplesOpen((open) => !open)}
          >
            {samplesOpen ? "Article" : "Examples"}
          </button>
        </header>
        {menuOpen ? (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-[#06245f]/50"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative flex h-full w-[min(18rem,88vw)] flex-col bg-[#0A4BD6]">
              <div className="flex justify-end px-2 pt-2">
                <button
                  type="button"
                  aria-label="Close menu"
                  className="inline-flex size-10 items-center justify-center text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{nav}</div>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">{samplesOpen ? samples : article}</div>
      </div>

      <div className="relative z-10 hidden h-full w-full lg:flex">
        <div className="h-full w-60 shrink-0 border-r border-white/10">{nav}</div>
        <Group
          id="docs-layout"
          orientation="horizontal"
          className="h-full min-w-0 flex-1"
        >
          <Panel id="docs-content" minSize={320} className="h-full min-w-0">
            {article}
          </Panel>
          <Separator className={HANDLE} />
          <Panel
            id="docs-samples"
            defaultSize={360}
            minSize={220}
            maxSize="55%"
            collapsible
            collapsedSize={0}
            className="h-full border-l border-white/10"
          >
            {samples}
          </Panel>
        </Group>
      </div>
    </main>
  );
}

import { ArrowLeft } from "lucide-react";
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
  { id: "webhooks", label: "Webhooks AWS SNS" },
];

const SECTIONS: Record<
  DocId,
  { title: string; kicker: string; body: string[]; bullets: string[] }
> = {
  "getting-started": {
    title: "Ship transactional mail on your own SES account.",
    kicker: "Getting started",
    body: [
      "Envoy is a FastAPI control plane in front of AWS SES v2. You keep the AWS bill, the domain identities, and the suppression list — Envoy only exposes a Resend-shaped HTTP API.",
      "Provision Postgres, set AWS credentials, then declare a sending domain. Easy DKIM CNAMEs plus SPF and DMARC are returned immediately. Once SES reports DKIM SUCCESS, POST /api/v1/send is live.",
    ],
    bullets: [
      "Base URL: https://mail.your-stack.tld/api/v1",
      "Auth header: Authorization: Bearer envoy_live_…",
      "Send returns 202 with a messageId in under 80 ms",
    ],
  },
  authentication: {
    title: "Hashed keys, prefix envoy_live_, instant revoke.",
    kicker: "Authentication",
    body: [
      "API keys are generated in the console, stored as SHA-256 hashes, and never shown again after creation. Middleware reads the Bearer token on every request and applies daily, monthly, and domain quotas before SES is called.",
      "Revoking a key takes effect on the next request. There is no public sign-up: keys exist only for invited workspace members.",
    ],
    bullets: [
      "Prefix envoy_live_ identifies production tokens",
      "Quota overrides apply without a process restart",
      "Missing or revoked keys return 401 Unauthorized",
    ],
  },
  domains: {
    title: "Zero-maintenance DNS orchestration.",
    kicker: "Domains API",
    body: [
      "POST /api/v1/domains creates an SES email identity and returns three Easy DKIM CNAME records, one SPF TXT (v=spf1 include:amazonses.com ~all), and one DMARC TXT.",
      "GET /api/v1/domains/{id}/verify polls get_email_identity until DKIM SUCCESS, then marks the domain as sending-ready.",
    ],
    bullets: [
      "POST /api/v1/domains — declare identity",
      "GET /api/v1/domains — list workspace domains",
      "GET /api/v1/domains/{id}/verify — DKIM status",
      "DELETE /api/v1/domains/{id} — drop identity",
    ],
  },
  sending: {
    title: "Sub-80ms accepted, SES in the background.",
    kicker: "Sending API",
    body: [
      "POST /api/v1/send validates the payload, checks the global suppression list, then enqueues boto3 send_email on SES v2. The HTTP response includes messageId immediately; delivery, bounce, and complaint events arrive later through SNS.",
      "From addresses must match a verified domain. Recipients on the suppression list are rejected before SES to protect reputation.",
    ],
    bullets: [
      "202 Accepted with { id, messageId }",
      "HTML, text, reply-to, tags, and scheduled send",
      "Hard bounces auto-feed the suppression list",
    ],
  },
  webhooks: {
    title: "SNS notifications become an audit trail.",
    kicker: "Webhooks AWS SNS",
    body: [
      "POST /api/v1/webhooks/ses accepts Amazon SNS envelopes. SubscriptionConfirmation is confirmed against *.amazonaws.com signing URLs. Notification payloads update email_logs and, for Permanent bounces or complaints, insert the recipient into suppression_list.",
      "Point the SES configuration set event destination at this endpoint after deploying Envoy.",
    ],
    bullets: [
      "Handles SubscriptionConfirmation",
      "Stores Delivery, Bounce, Complaint events",
      "Protects SES reputation with auto-suppression",
    ],
  },
};

const SAMPLES: Record<DocId, Record<Lang, string>> = {
  "getting-started": {
    curl: `curl -sS https://mail.acme.io/healthz
# {"status":"ok","postgres":"up"}`,
    python: `import httpx

r = httpx.get("https://mail.acme.io/healthz", timeout=5)
print(r.json())`,
    node: `const res = await fetch("https://mail.acme.io/healthz");
console.log(await res.json());`,
  },
  authentication: {
    curl: `curl -sS https://mail.acme.io/api/v1/domains \\
  -H "Authorization: Bearer envoy_live_7kQe2mR9wLp0"`,
    python: `import httpx

headers = {"Authorization": "Bearer envoy_live_7kQe2mR9wLp0"}
r = httpx.get("https://mail.acme.io/api/v1/domains", headers=headers)
print(r.status_code)`,
    node: `const res = await fetch("https://mail.acme.io/api/v1/domains", {
  headers: { Authorization: "Bearer envoy_live_7kQe2mR9wLp0" },
});
console.log(res.status);`,
  },
  domains: {
    curl: `curl -sS -X POST https://mail.acme.io/api/v1/domains \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"mail.acme.io"}'`,
    python: `import httpx

r = httpx.post(
    "https://mail.acme.io/api/v1/domains",
    headers={"Authorization": "Bearer envoy_live_…"},
    json={"name": "mail.acme.io"},
)
print(r.json())`,
    node: `const res = await fetch("https://mail.acme.io/api/v1/domains", {
  method: "POST",
  headers: {
    Authorization: "Bearer envoy_live_…",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "mail.acme.io" }),
});
console.log(await res.json());`,
  },
  sending: {
    curl: `curl -sS -X POST https://mail.acme.io/api/v1/send \\
  -H "Authorization: Bearer envoy_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from":"Envoy <hello@mail.acme.io>",
    "to":["ops@acme.io"],
    "subject":"Invoice 2048",
    "html":"<p>Paid.</p>"
  }'`,
    python: `import httpx

r = httpx.post(
    "https://mail.acme.io/api/v1/send",
    headers={"Authorization": "Bearer envoy_live_…"},
    json={
        "from": "Envoy <hello@mail.acme.io>",
        "to": ["ops@acme.io"],
        "subject": "Invoice 2048",
        "html": "<p>Paid.</p>",
    },
)
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
  }),
});
console.log(await res.json());`,
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
  const content = SECTIONS[section];
  const sample = useMemo(() => SAMPLES[section][lang], [section, lang]);

  const nav = (
    <aside className="flex min-h-0 flex-col bg-white/5 px-5 py-6 lg:h-full lg:px-6 lg:py-8">
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
            onClick={() => setSection(item.id)}
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
    <article className="h-full min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-12 lg:px-12">
      <p className="mb-4 font-mono text-xs tracking-widest text-white/50 uppercase">
        <span aria-hidden="true">■ </span>
        {content.kicker}
      </p>
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
        {content.title}
      </h1>
      <div className="mt-8 max-w-3xl space-y-4 text-base leading-relaxed text-white/70">
        {content.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
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
      <pre className="min-h-0 flex-1 overflow-auto px-5 py-6 font-mono text-[12px] leading-relaxed text-[#9ec4ff]">
        <code>{sample}</code>
      </pre>
    </aside>
  );

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white">
      <div className="relative z-10 flex h-full min-h-0 flex-col lg:hidden">
        <div className="shrink-0 border-b border-white/10">{nav}</div>
        <div className="min-h-0 flex-1 overflow-hidden">{article}</div>
        <div className="max-h-[40%] shrink-0 border-t border-white/10">{samples}</div>
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

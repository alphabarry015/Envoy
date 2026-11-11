import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

export type DnsRecord = {
  type: "CNAME" | "TXT" | "MX";
  name: string;
  value: string;
  ttl: number;
  purpose: "DKIM" | "SPF" | "DMARC" | "BREVO" | "MAILTRAP" | "MX" | string;
  status: "pending" | "verified";
  /** Sending tool that owns this record. */
  source?: "ses" | "brevo" | "resend" | "mailtrap" | string;
  /** MX priority when type is MX. */
  priority?: number | null;
};

export type DomainStatus = "pending" | "verified" | "failed";
export type DkimStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "TEMPORARY_FAILURE";

export type ConsoleDomain = {
  id: string;
  name: string;
  status: DomainStatus;
  dkimStatus: DkimStatus;
  /** DNS host / registrar where DKIM·SPF·DMARC records are (or will be) published. */
  provider: string;
  /** Email tools where this domain is registered (SES, Resend, …). */
  sendingProviders: string[];
  /** SES sending region — set by backend later. */
  region: string;
  dnsRecords: DnsRecord[];
  createdAt: string;
  verifiedAt: string | null;
  mailFrom?: string;
  /** Default sender local part when an API call omits "from". */
  fromLocalPart?: string;
  fromName?: string | null;
  /** Reply-To added when an API call has none. Null = replies not expected. */
  replyTo?: string | null;
  /** False until the sender settings were saved once (orange dot in the UI). */
  senderConfigured?: boolean;
  /** Backend warnings when a tool could not sync DNS. */
  toolWarnings?: string[];
};

export const DOMAIN_PATTERN =
  /^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Known DNS hosts inferred from NS / SOA (mock until backend NS lookup). */
export const DNS_PROVIDERS = [
  "Cloudflare",
  "Vercel",
  "OVH",
  "Amazon Route 53",
  "Namecheap",
  "GoDaddy",
  "Porkbun",
  "Gandi",
  "Other",
] as const;

export type DnsProvider = (typeof DNS_PROVIDERS)[number];

const DEFAULT_DNS_PROVIDER: DnsProvider = "Other";

/** Heuristic NS patterns → provider (mirrors what a backend NS lookup would return). */
const NS_HINTS: ReadonlyArray<{ test: RegExp; provider: DnsProvider }> = [
  { test: /\.cloudflare\.com$/i, provider: "Cloudflare" },
  { test: /\.vercel-dns\.com$/i, provider: "Vercel" },
  { test: /\.ovh\.net$/i, provider: "OVH" },
  { test: /\.awsdns-/i, provider: "Amazon Route 53" },
  { test: /\.namecheaphosting\.com$/i, provider: "Namecheap" },
  { test: /\.registrar-servers\.com$/i, provider: "Namecheap" },
  { test: /\.domaincontrol\.com$/i, provider: "GoDaddy" },
  { test: /\.porkbun\.com$/i, provider: "Porkbun" },
  { test: /\.gandi\.net$/i, provider: "Gandi" },
];

/** Detect the DNS host from the nameservers returned by the API. */
export function detectDnsProvider(
  _domain: string,
  nameservers?: string[],
): DnsProvider {
  const nsList = nameservers ?? [];

  for (const ns of nsList) {
    const host = ns.replace(/\.$/, "").toLowerCase();
    for (const hint of NS_HINTS) {
      if (hint.test.test(host)) return hint.provider;
    }
  }
  return DEFAULT_DNS_PROVIDER;
}

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function buildDnsRecords(domain: string): DnsRecord[] {
  const tokens = ["n3x7a1", "k8m2c4", "p5r9d0"];
  return [
    ...tokens.map((token) => ({
      type: "CNAME" as const,
      name: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`,
      ttl: 300,
      purpose: "DKIM" as const,
      status: "pending" as const,
    })),
    {
      type: "TXT",
      name: domain,
      value: "v=spf1 include:amazonses.com ~all",
      ttl: 300,
      purpose: "SPF",
      status: "pending",
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none;",
      ttl: 300,
      purpose: "DMARC",
      status: "pending",
    },
  ];
}

export function createDomain(name: string, sendingProviders: string[] = ["ses"]): ConsoleDomain {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    status: "pending",
    dkimStatus: "PENDING",
    provider: detectDnsProvider(name),
    sendingProviders,
    region: "us-east-1",
    dnsRecords: buildDnsRecords(name),
    createdAt: now,
    verifiedAt: null,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CSV compatible registrar imports (Type, Name, Value, TTL, Purpose). */
export function toDnsCsv(domain: ConsoleDomain): string {
  const header = "Type,Name,Value,TTL,Purpose";
  const rows = domain.dnsRecords.map((record) =>
    [
      record.type,
      record.name,
      record.value,
      String(record.ttl || 300),
      record.purpose,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows, ""].join("\n");
}

type DomainPayload = {
  id: string;
  name: string;
  status: DomainStatus;
  dkim_status: DkimStatus;
  providers?: string[];
  dns_records: DnsRecord[];
  created_at: string;
  verified_at: string | null;
  region?: string;
  nameservers?: string[];
  mail_from?: string;
  from_local_part?: string;
  from_name?: string | null;
  reply_to?: string | null;
  sender_configured?: boolean;
  tool_warnings?: string[];
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "Domain request failed.";
}

export function dnsRecordsForTool(
  records: DnsRecord[],
  toolId: string,
): DnsRecord[] {
  const source = toolId.toLowerCase();
  // Strict: only this tool's tagged records (never mix other tools).
  const tagged = records.filter(
    (record) => (record.source || "").toLowerCase() === source,
  );
  if (tagged.length > 0) return tagged;
  // Legacy untagged rows only for SES, and only when no other sources exist.
  if (source === "ses") {
    const hasOtherSources = records.some((record) =>
      Boolean(record.source && record.source.toLowerCase() !== "ses"),
    );
    if (hasOtherSources) return [];
    return records.filter((record) => !record.source);
  }
  return [];
}

function fromPayload(row: DomainPayload): ConsoleDomain {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    dkimStatus: row.dkim_status,
    provider: detectDnsProvider(row.name, row.nameservers),
    sendingProviders: Array.isArray(row.providers) && row.providers.length > 0 ? row.providers : ["ses"],
    region: row.region || "us-east-2",
    dnsRecords: Array.isArray(row.dns_records) ? row.dns_records : [],
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    mailFrom: row.mail_from || `noreply@${row.name}`,
    fromLocalPart: row.from_local_part || "noreply",
    fromName: row.from_name ?? null,
    replyTo: row.reply_to ?? null,
    senderConfigured: Boolean(row.sender_configured),
    toolWarnings: Array.isArray(row.tool_warnings) ? row.tool_warnings : [],
  };
}

export async function fetchDomains(): Promise<ConsoleDomain[]> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains`, { headers: authHeader() });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { items: DomainPayload[] };
  return (body.items ?? []).map(fromPayload);
}

export async function fetchDomain(id: string): Promise<ConsoleDomain | null> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains/${id}`, { headers: authHeader() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as DomainPayload);
}

export async function connectRemoteDomain(
  name: string,
  providers: string[] = ["ses"],
): Promise<ConsoleDomain> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ name, providers }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as DomainPayload);
}

export async function updateDomainProviders(
  id: string,
  providers: string[],
): Promise<ConsoleDomain> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains/${id}/providers`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ providers }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as DomainPayload);
}

export async function verifyRemoteDomain(id: string): Promise<ConsoleDomain> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains/${id}/verify`, { headers: authHeader() });
  if (!response.ok) throw new Error(await readError(response));
  const current = await fetchDomain(id);
  if (!current) throw new Error("Domain not found.");
  return current;
}

/** Live DNS check only (no call to the sending tools); a no-op once every record is verified. */
export async function recheckDomainDns(id: string): Promise<void> {
  const response = await fetch(`${apiUrl()}/api/v1/domains/${id}/dns-recheck`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function disconnectRemoteDomain(id: string): Promise<void> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/domains/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export type DomainSenderInput = {
  fromLocalPart: string;
  fromName: string;
  replyMode: "none" | "address";
  replyTo: string;
};

export async function updateDomainSender(id: string, input: DomainSenderInput): Promise<ConsoleDomain> {
  const response = await fetch(`${apiUrl()}/api/v1/domains/${id}/sender`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      from_local_part: input.fromLocalPart.trim(),
      from_name: input.fromName.trim() || null,
      reply_mode: input.replyMode,
      reply_to: input.replyMode === "address" ? input.replyTo.trim() : null,
    }),
  });
  if (!response.ok) {
    let detail = "Could not save the sender settings.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail) && body.detail.length > 0) {
        const first = body.detail[0] as { msg?: string };
        if (typeof first.msg === "string") detail = first.msg.replace(/^Value error, /, "");
      }
    } catch {
      /* réponse non JSON */
    }
    throw new Error(detail);
  }
  return fromPayload((await response.json()) as DomainPayload);
}

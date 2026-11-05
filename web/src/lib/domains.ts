import { readJsonStorage, storedObjects, writeJsonStorage } from "./safeStorage";

export type DnsRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  ttl: number;
  purpose: "DKIM" | "SPF" | "DMARC";
  status: "pending" | "verified";
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
  /** SES sending region — set by backend later. */
  region: string;
  dnsRecords: DnsRecord[];
  createdAt: string;
  verifiedAt: string | null;
};

const STORAGE_KEY = "envoy.console.domains.v2";

export const DOMAIN_PATTERN =
  /^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Known DNS hosts inferred from NS / SOA (mock until backend NS lookup). */
export const DNS_PROVIDERS = [
  "Cloudflare",
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
  { test: /\.ovh\.net$/i, provider: "OVH" },
  { test: /\.awsdns-/i, provider: "Amazon Route 53" },
  { test: /\.namecheaphosting\.com$/i, provider: "Namecheap" },
  { test: /\.registrar-servers\.com$/i, provider: "Namecheap" },
  { test: /\.domaincontrol\.com$/i, provider: "GoDaddy" },
  { test: /\.porkbun\.com$/i, provider: "Porkbun" },
  { test: /\.gandi\.net$/i, provider: "Gandi" },
];

/**
 * Detect the DNS host from nameserver hostnames.
 * UI mock: derives deterministic fake NS from the domain until a real lookup exists.
 */
export function detectDnsProvider(
  domain: string,
  nameservers?: string[],
): DnsProvider {
  const nsList =
    nameservers && nameservers.length > 0
      ? nameservers
      : mockNameservers(domain);

  for (const ns of nsList) {
    const host = ns.replace(/\.$/, "").toLowerCase();
    for (const hint of NS_HINTS) {
      if (hint.test.test(host)) return hint.provider;
    }
  }
  return DEFAULT_DNS_PROVIDER;
}

/** Deterministic fake NS set so the console always “detects” without a backend. */
function mockNameservers(domain: string): string[] {
  const pool: DnsProvider[] = [
    "Cloudflare",
    "OVH",
    "Amazon Route 53",
    "Namecheap",
    "GoDaddy",
    "Porkbun",
    "Gandi",
  ];
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  const provider = pool[hash % pool.length];
  switch (provider) {
    case "Cloudflare":
      return ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"];
    case "OVH":
      return ["dns11.ovh.net", "ns11.ovh.net"];
    case "Amazon Route 53":
      return ["ns-12.awsdns-01.com", "ns-34.awsdns-02.co.uk"];
    case "Namecheap":
      return ["dns1.registrar-servers.com", "dns2.registrar-servers.com"];
    case "GoDaddy":
      return ["ns01.domaincontrol.com", "ns02.domaincontrol.com"];
    case "Porkbun":
      return ["curitiba.ns.porkbun.com", "fortaleza.ns.porkbun.com"];
    case "Gandi":
      return ["ns-1-a.gandi.net", "ns-1-b.gandi.net"];
    default:
      return ["ns1.example.com", "ns2.example.com"];
  }
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

export function createDomain(name: string): ConsoleDomain {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    status: "pending",
    dkimStatus: "PENDING",
    provider: detectDnsProvider(name),
    region: "us-east-1",
    dnsRecords: buildDnsRecords(name),
    createdAt: now,
    verifiedAt: null,
  };
}

function normalizeDomainRecord(domain: ConsoleDomain): ConsoleDomain {
  const provider =
    !domain.provider || domain.provider === "AWS SES"
      ? DEFAULT_DNS_PROVIDER
      : domain.provider;
  return {
    ...domain,
    provider,
    region: domain.region || "us-east-1",
    dnsRecords: Array.isArray(domain.dnsRecords) ? domain.dnsRecords : [],
  };
}

export function markDomainVerified(domain: ConsoleDomain): ConsoleDomain {
  const now = new Date().toISOString();
  return {
    ...domain,
    status: "verified",
    dkimStatus: "SUCCESS",
    verifiedAt: now,
    dnsRecords: domain.dnsRecords.map((record) => ({
      ...record,
      status: "verified",
    })),
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

function isDomainArray(value: unknown): value is ConsoleDomain[] {
  return Array.isArray(value);
}

export function readStoredDomains(): ConsoleDomain[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isDomainArray);
  if (!parsed) return seedDomains();
  return storedObjects(parsed).map(normalizeDomainRecord);
}

export function getStoredDomain(id: string): ConsoleDomain | null {
  return readStoredDomains().find((domain) => domain.id === id) ?? null;
}

export function writeStoredDomains(domains: ConsoleDomain[]) {
  writeJsonStorage(localStorage, STORAGE_KEY, domains);
}

export function updateStoredDomain(
  id: string,
  updater: (domain: ConsoleDomain) => ConsoleDomain,
): ConsoleDomain | null {
  const domains = readStoredDomains();
  let updated: ConsoleDomain | null = null;
  const next = domains.map((domain) => {
    if (domain.id !== id) return domain;
    updated = updater(domain);
    return updated;
  });
  if (!updated) return null;
  writeStoredDomains(next);
  return updated;
}

export function removeStoredDomain(id: string): ConsoleDomain[] {
  const next = readStoredDomains().filter((domain) => domain.id !== id);
  writeStoredDomains(next);
  return next;
}

function seedDomains(): ConsoleDomain[] {
  const verified = markDomainVerified(createDomain("mail.acme.io"));
  const pending = createDomain("notify.openrich.app");
  const seed = [verified, pending];
  writeStoredDomains(seed);
  return seed;
}

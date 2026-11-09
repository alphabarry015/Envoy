import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";
import { readApiError } from "./users";

export type ProviderUsage = {
  sent_today: number;
  sent_month: number;
  failovers_today: number;
};

/** Connected in Envoy vs hosted on the tool (what the service currently offers). */
export type ProviderDomainStats = {
  connected: number;
  offered: number;
  offered_known: boolean;
};

export type ProviderStatusCounts = {
  queued: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
};

export type ProviderItem = {
  id: string;
  label: string;
  enabled: boolean;
  connected: boolean;
  /** False when the key can send but cannot provision/verify domains. */
  domain_capable: boolean;
  role: string;
  sort_order: number;
  daily_limit: number | null;
  monthly_limit: number | null;
  usage: ProviderUsage;
  domains: ProviderDomainStats;
  testing: boolean;
};

export type ProviderRecentSend = {
  id: string;
  message_id: string;
  subject: string;
  status: string;
  from_address: string;
  created_at: string;
};

export type ProviderWebhookLink = {
  tool: string;
  expected_url: string;
  linked: boolean;
  remote_id: string | number | null;
  remote_url: string | null;
  active: boolean | null;
  detail: string | null;
  secret_configured: boolean;
  ensured: boolean;
  created: boolean;
  signing_secret_once?: string | null;
};

export type ProviderConnection = {
  api_ok: boolean;
  api_detail: string | null;
  webhook: ProviderWebhookLink | null;
};

export type ProviderDetail = ProviderItem & {
  remaining_today: number | null;
  remaining_month: number | null;
  status_today: ProviderStatusCounts;
  status_month: ProviderStatusCounts;
  recent: ProviderRecentSend[];
  policy: string;
  effective_order: string[];
  connection?: ProviderConnection | null;
};

export type ProvidersResponse = {
  policy: string;
  autofailover: boolean;
  effective_order: string[];
  items: ProviderItem[];
};

export type ProviderPatch = {
  id: string;
  enabled?: boolean;
  sort_order?: number;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  clear_daily_limit?: boolean;
  clear_monthly_limit?: boolean;
};

export async function fetchProviders(): Promise<ProvidersResponse> {
  const response = await fetch(`${apiUrl()}/api/v1/providers`, {
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not load providers."));
  return (await response.json()) as ProvidersResponse;
}

export async function fetchProvider(id: string): Promise<ProviderDetail> {
  const response = await fetch(`${apiUrl()}/api/v1/providers/${encodeURIComponent(id)}`, {
    headers: authHeader(),
  });
  if (response.status === 404) throw new Error("Provider not found.");
  if (!response.ok) throw new Error(await readApiError(response, "Could not load provider."));
  return (await response.json()) as ProviderDetail;
}

export async function updateProviders(items: ProviderPatch[]): Promise<ProvidersResponse> {
  const response = await fetch(`${apiUrl()}/api/v1/providers`, {
    method: "PATCH",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not update providers."));
  return (await response.json()) as ProvidersResponse;
}

export async function ensureProviderWebhook(id: string): Promise<ProviderWebhookLink> {
  const response = await fetch(
    `${apiUrl()}/api/v1/providers/${encodeURIComponent(id)}/webhook`,
    {
      method: "POST",
      headers: authHeader(),
    },
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "Could not sync inbound webhook."));
  }
  return (await response.json()) as ProviderWebhookLink;
}

export function roleLabel(role: string): string {
  if (role === "primary") return "Primary";
  if (role === "off") return "Off";
  if (role === "not_configured") return "Not configured";
  if (role === "skipped") return "Skipped";
  if (role.startsWith("fallback_")) return `Fallback ${role.slice("fallback_".length)}`;
  return role;
}

export function usageRatio(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(used / limit, 1);
}

export function domainStatsLabel(domains: ProviderDomainStats | undefined): string {
  if (!domains) return "Domains —";
  const connected = new Intl.NumberFormat("en").format(domains.connected);
  const offered = new Intl.NumberFormat("en").format(domains.offered);
  if (domains.offered_known) {
    return `Domains ${connected} connected / ${offered} on tool`;
  }
  return `Domains ${connected} connected`;
}

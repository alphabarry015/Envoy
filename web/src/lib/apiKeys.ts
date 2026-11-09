import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

export type ApiKeyStatus = "active" | "revoked";
export type ApiKeyMode = "live" | "sandbox";

/** Scopes aligned with CDC API matrix + audit trail. */
export const API_KEY_SCOPES = [
  {
    id: "send",
    label: "Send",
    description: "POST /api/v1/send",
  },
  {
    id: "domains",
    label: "Domains",
    description: "Declare & verify sending domains",
  },
  {
    id: "logs",
    label: "Logs",
    description: "Read delivery / bounce events",
  },
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]["id"];

export const DAILY_QUOTA_OPTIONS = [1_000, 5_000, 25_000, 100_000] as const;
export const MONTHLY_QUOTA_OPTIONS = [
  10_000, 100_000, 500_000, 1_000_000,
] as const;

export type ConsoleApiKey = {
  id: string;
  name: string;
  /** Full secret — only present right after creation (never re-stored). */
  secret?: string;
  /** Visible prefix stored permanently, e.g. envoy_live_7kQe2m… */
  prefix: string;
  mode: ApiKeyMode;
  scopes: ApiKeyScope[];
  /** Daily send quota; null = unlimited. */
  dailyQuota: number | null;
  /** Monthly send quota; null = unlimited. */
  monthlyQuota: number | null;
  /** Preferred transport; null = platform auto failover. */
  preferredProvider: string | null;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreateApiKeyInput = {
  name: string;
  mode: ApiKeyMode;
  scopes: ApiKeyScope[];
  dailyQuota: number | null;
  monthlyQuota: number | null;
  preferredProvider?: string | null;
};

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const DEFAULT_SCOPES: ApiKeyScope[] = ["send"];

function randomToken(length = 32): string {
  const alphabet = ALPHABET.length;
  const limit = Math.floor(256 / alphabet) * alphabet;
  let token = "";
  while (token.length < length) {
    const bytes = new Uint8Array(length - token.length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      token += ALPHABET[byte % alphabet];
      if (token.length === length) break;
    }
  }
  return token;
}

export function generateApiKeySecret(mode: ApiKeyMode): string {
  const prefix = mode === "sandbox" ? "envoy_test_" : "envoy_live_";
  return `${prefix}${randomToken(40)}`;
}

function toPrefix(secret: string): string {
  return `${secret.slice(0, 18)}…`;
}

export function createApiKey(input: CreateApiKeyInput): ConsoleApiKey {
  const secret = generateApiKeySecret(input.mode);
  const now = new Date().toISOString();
  const scopes =
    input.scopes.length > 0 ? [...input.scopes] : [...DEFAULT_SCOPES];
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Untitled key",
    secret,
    prefix: toPrefix(secret),
    mode: input.mode,
    scopes,
    dailyQuota: input.dailyQuota,
    monthlyQuota: input.monthlyQuota,
    preferredProvider: input.preferredProvider ?? null,
    status: "active",
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };
}

type ApiKeyPayload = {
  id: string;
  name: string;
  key_prefix: string;
  mode: ApiKeyMode;
  scopes: ApiKeyScope[];
  daily_quota: number | null;
  monthly_quota: number | null;
  preferred_provider: string | null;
  is_active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  key?: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "API key request failed.";
}

function fromPayload(row: ApiKeyPayload): ConsoleApiKey {
  return {
    id: row.id,
    name: row.name,
    secret: row.key,
    prefix: row.key_prefix,
    mode: row.mode === "sandbox" ? "sandbox" : "live",
    scopes: row.scopes?.length ? row.scopes : [...DEFAULT_SCOPES],
    dailyQuota: row.daily_quota,
    monthlyQuota: row.monthly_quota,
    preferredProvider: row.preferred_provider ?? null,
    status: row.is_active ? "active" : "revoked",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function fetchApiKeys(): Promise<ConsoleApiKey[]> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/api-keys`, { headers: authHeader() });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as ApiKeyPayload[];
  return body.map(fromPayload);
}

export async function createRemoteApiKey(input: CreateApiKeyInput): Promise<ConsoleApiKey> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      name: input.name.trim(),
      mode: input.mode,
      scopes: input.scopes.length > 0 ? input.scopes : [...DEFAULT_SCOPES],
      daily_quota: input.dailyQuota,
      monthly_quota: input.monthlyQuota,
      preferred_provider: input.preferredProvider ?? null,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as ApiKeyPayload);
}

export async function revokeRemoteApiKey(id: string): Promise<ConsoleApiKey> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${id}/revoke`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as ApiKeyPayload);
}

export async function deleteRemoteApiKey(id: string): Promise<void> {
  const baseUrl = apiUrl();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export function formatQuota(value: number | null): string {
  if (value === null) return "∞";
  return value.toLocaleString("en-US");
}

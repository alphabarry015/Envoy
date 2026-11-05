import { readJsonStorage, writeJsonStorage } from "./safeStorage";

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
};

const STORAGE_KEY = "envoy.console.api-keys.v2";

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const DEFAULT_SCOPES: ApiKeyScope[] = ["send"];

function randomToken(length = 32): string {
  let token = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) {
    token += ALPHABET[bytes[i]! % ALPHABET.length];
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

function normalizeKey(key: ConsoleApiKey): ConsoleApiKey {
  return {
    ...key,
    mode: key.mode === "sandbox" ? "sandbox" : "live",
    scopes:
      Array.isArray(key.scopes) && key.scopes.length > 0
        ? key.scopes
        : [...DEFAULT_SCOPES],
    dailyQuota: key.dailyQuota ?? 5_000,
    monthlyQuota: key.monthlyQuota ?? 100_000,
    secret: undefined,
  };
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
    status: "active",
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };
}

/** Persistable shape — secret never written to storage. */
function toStored(key: ConsoleApiKey): ConsoleApiKey {
  const { secret: _secret, ...rest } = key;
  return rest;
}

function isApiKeyArray(value: unknown): value is ConsoleApiKey[] {
  return Array.isArray(value);
}

export function readStoredApiKeys(): ConsoleApiKey[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isApiKeyArray);
  if (!parsed) return seedApiKeys();
  return parsed.map(normalizeKey);
}

export function writeStoredApiKeys(keys: ConsoleApiKey[]) {
  writeJsonStorage(
    localStorage,
    STORAGE_KEY,
    keys.map((key) => toStored(key)),
  );
}

export function revokeStoredApiKey(id: string): ConsoleApiKey[] {
  const now = new Date().toISOString();
  const next = readStoredApiKeys().map((key) =>
    key.id === id && key.status === "active"
      ? { ...key, status: "revoked" as const, revokedAt: now, secret: undefined }
      : key,
  );
  writeStoredApiKeys(next);
  return next;
}

export function removeStoredApiKey(id: string): ConsoleApiKey[] {
  const next = readStoredApiKeys().filter((key) => key.id !== id);
  writeStoredApiKeys(next);
  return next;
}

export function formatQuota(value: number | null): string {
  if (value === null) return "∞";
  return value.toLocaleString("en-US");
}

function seedApiKeys(): ConsoleApiKey[] {
  const now = Date.now();
  const seed: ConsoleApiKey[] = [
    {
      id: crypto.randomUUID(),
      name: "Production",
      prefix: "envoy_live_7kQe2mR9…",
      mode: "live",
      scopes: ["send", "domains", "logs"],
      dailyQuota: 5_000,
      monthlyQuota: 100_000,
      status: "active",
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 12).toISOString(),
      lastUsedAt: new Date(now - 1000 * 60 * 8).toISOString(),
      revokedAt: null,
    },
    {
      id: crypto.randomUUID(),
      name: "CI / staging",
      prefix: "envoy_test_p5r9d0n3…",
      mode: "sandbox",
      scopes: ["send"],
      dailyQuota: 1_000,
      monthlyQuota: 10_000,
      status: "active",
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
      lastUsedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
      revokedAt: null,
    },
  ];
  writeStoredApiKeys(seed);
  return seed;
}

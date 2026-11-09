import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

export const WEBHOOK_EVENTS = [
  { id: "email.sent", label: "Sent", description: "Accepted by SES" },
  { id: "email.delivered", label: "Delivered", description: "Mailbox accepted the message" },
  { id: "email.bounced", label: "Bounced", description: "Permanent or transient bounce" },
  { id: "email.complained", label: "Complained", description: "Recipient marked the message as spam" },
  { id: "email.failed", label: "Failed", description: "Send failed before delivery" },
  { id: "email.suppressed", label: "Suppressed", description: "Blocked by the suppression list" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"];
export type WebhookStatus = "active" | "disabled";

export type ConsoleWebhook = {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  /** Null/empty = all providers. */
  providers: string[] | null;
  /** Signing secret — only present right after creation or rotation. */
  secret?: string;
  /** Visible prefix stored permanently, e.g. whsec_7kQe2m… */
  prefix: string;
  status: WebhookStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookInput = {
  name: string;
  url: string;
  events: WebhookEvent[];
  providers?: string[] | null;
};

export type UpdateWebhookInput = {
  name: string;
  url: string;
  events: WebhookEvent[];
  providers?: string[] | null;
};

const EVENT_IDS = new Set<string>(WEBHOOK_EVENTS.map((event) => event.id));
const DEFAULT_EVENTS: WebhookEvent[] = ["email.delivered", "email.bounced", "email.complained"];

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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

export function generateWebhookSecret(): string {
  return `whsec_${randomToken(32)}`;
}

function toPrefix(secret: string): string {
  return `${secret.slice(0, 14)}…`;
}

/** https endpoints, plus http on localhost for local receivers. */
export function normalizeWebhookUrl(value: string): string | null {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.toString();
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && local) return url.toString();
  return null;
}

function knownEvents(events: unknown): WebhookEvent[] {
  if (!Array.isArray(events)) return [...DEFAULT_EVENTS];
  const next = events.filter((event): event is WebhookEvent => typeof event === "string" && EVENT_IDS.has(event));
  return next.length > 0 ? next : [...DEFAULT_EVENTS];
}

type WebhookPayload = {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  providers?: string[] | null;
  secret_prefix: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  secret?: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "Webhook request failed.";
}

function fromPayload(row: WebhookPayload): ConsoleWebhook {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: knownEvents(row.events),
    providers: row.providers?.length ? row.providers : null,
    secret: row.secret,
    prefix: row.secret_prefix,
    status: row.is_active ? "active" : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function webhookRequest(path: string, init: RequestInit): Promise<Response> {
  const baseUrl = apiUrl();
  const headers = new Headers(init.headers);
  const auth = new Headers(authHeader());
  auth.forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}/api/v1/webhooks${path}`, { ...init, headers });
}

export async function fetchWebhooks(): Promise<ConsoleWebhook[]> {
  const response = await webhookRequest("", { method: "GET" });
  if (!response.ok) throw new Error(await readError(response));
  return ((await response.json()) as WebhookPayload[]).map(fromPayload);
}

export async function createRemoteWebhook(input: CreateWebhookInput): Promise<ConsoleWebhook> {
  const response = await webhookRequest("", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      url: input.url,
      events: input.events,
      providers: input.providers ?? null,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as WebhookPayload);
}

export async function updateRemoteWebhook(id: string, input: UpdateWebhookInput): Promise<ConsoleWebhook> {
  const response = await webhookRequest(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      url: input.url,
      events: input.events,
      providers: input.providers ?? null,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as WebhookPayload);
}

export async function setRemoteWebhookStatus(id: string, status: WebhookStatus): Promise<ConsoleWebhook> {
  const response = await webhookRequest(`/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ active: status === "active" }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as WebhookPayload);
}

export async function rotateRemoteWebhookSecret(id: string): Promise<ConsoleWebhook> {
  const response = await webhookRequest(`/${id}/rotate`, { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as WebhookPayload);
}

export async function deleteRemoteWebhook(id: string): Promise<void> {
  const response = await webhookRequest(`/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export function createWebhook(input: CreateWebhookInput): ConsoleWebhook {
  const secret = generateWebhookSecret();
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Untitled webhook",
    url: normalizeWebhookUrl(input.url) ?? input.url.trim(),
    events: input.events.length > 0 ? [...input.events] : [...DEFAULT_EVENTS],
    providers: input.providers ?? null,
    secret,
    prefix: toPrefix(secret),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

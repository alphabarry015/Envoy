import { authHeader } from "./auth";

export const SUPPRESSION_REASONS = [
  "hard_bounce",
  "complaint",
  "unsubscribe",
  "manual",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];
export type SuppressionSource = "sns" | "manual";

export const REASON_LABELS: Record<SuppressionReason, string> = {
  hard_bounce: "Hard bounce",
  complaint: "Complaint",
  unsubscribe: "Unsubscribe",
  manual: "Manual",
};

export type SuppressionEntry = {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  createdAt: string;
};

type SuppressionPayload = {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string;
  created_at: string;
};

function apiUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "Suppression request failed.";
}

function fromPayload(row: SuppressionPayload): SuppressionEntry {
  const source: SuppressionSource = row.source === "manual" ? "manual" : "sns";
  return {
    id: row.id,
    email: row.email,
    reason: row.reason,
    source,
    createdAt: row.created_at,
  };
}

async function suppressionRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = apiUrl();
  if (!baseUrl) throw new Error("VITE_API_URL is not set.");
  const headers = new Headers(init.headers);
  const auth = new Headers(authHeader());
  auth.forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}/api/v1/suppressions${path}`, { ...init, headers });
}

export async function fetchSuppressions(): Promise<SuppressionEntry[]> {
  const response = await suppressionRequest("");
  if (!response.ok) throw new Error(await readError(response));
  return ((await response.json()) as SuppressionPayload[]).map(fromPayload);
}

export async function createRemoteSuppression(
  email: string,
  reason: SuppressionReason,
): Promise<SuppressionEntry> {
  const response = await suppressionRequest("", {
    method: "POST",
    body: JSON.stringify({ email, reason }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as SuppressionPayload);
}

export async function deleteRemoteSuppression(id: string): Promise<void> {
  const response = await suppressionRequest(`/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) throw new Error(await readError(response));
}

export function createSuppression(
  email: string,
  reason: SuppressionReason,
): SuppressionEntry {
  return {
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    reason,
    source: "manual",
    createdAt: new Date().toISOString(),
  };
}

export function filterSuppressions(
  entries: SuppressionEntry[],
  query: string,
  reason: SuppressionReason | "all",
): SuppressionEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (reason !== "all" && entry.reason !== reason) return false;
    if (!needle) return true;
    return entry.email.includes(needle);
  });
}

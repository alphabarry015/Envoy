import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

/** Aligns with the backend EmailStatus enum. */
export const EMAIL_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const HTTP_METHODS = ["GET", "POST"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type ConsoleEmailLog = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  status: EmailStatus;
  /** Sending tool that handled this message (ses, resend, …). */
  provider: string | null;
  /** HTTP status of the send request (200, 202, 403, 504, …). */
  httpStatus: number;
  /** HTTP method of the API call that produced this log. */
  method: HttpMethod;
  domain: string;
  apiKeyPrefix: string;
  errorMessage: string | null;
  sesMessageId?: string | null;
  bcc?: string[];
  /** HTML body sent to SES. */
  html: string;
  /** Plain-text alternative. */
  text: string;
  createdAt: string;
  sentAt: string | null;
  /** "invite" for invitation emails sent from the console, "api" otherwise. */
  kind: "api" | "invite";
};

type LogPayload = {
  id: string;
  message_id: string;
  ses_message_id: string | null;
  provider?: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  status: EmailStatus;
  error_message: string | null;
  html: string | null;
  text: string | null;
  domain: string | null;
  api_key_prefix: string | null;
  kind?: "api" | "invite";
  created_at: string;
  sent_at: string | null;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "Log request failed.";
}

function httpStatusFor(status: EmailStatus): number {
  if (status === "suppressed") return 422;
  if (status === "failed") return 502;
  return 202;
}

function fromPayload(row: LogPayload): ConsoleEmailLog {
  const address = row.from_address.includes("<")
    ? row.from_address.slice(row.from_address.lastIndexOf("<") + 1).replace(">", "")
    : row.from_address;
  const domain = row.domain ?? address.split("@")[1] ?? "—";
  return {
    id: row.id,
    messageId: row.message_id,
    from: row.from_address,
    to: row.to_addresses ?? [],
    cc: row.cc_addresses ?? [],
    bcc: row.bcc_addresses ?? [],
    subject: row.subject,
    status: row.status,
    provider: row.provider ?? null,
    httpStatus: httpStatusFor(row.status),
    method: "POST",
    domain,
    apiKeyPrefix: row.api_key_prefix ?? "—",
    errorMessage: row.error_message,
    sesMessageId: row.ses_message_id,
    html: row.html ?? "",
    text: row.text ?? "",
    createdAt: row.created_at,
    sentAt: row.sent_at,
    kind: row.kind === "invite" ? "invite" : "api",
  };
}

async function logRequest(path: string): Promise<Response> {
  const baseUrl = apiUrl();
  return fetch(`${baseUrl}/api/v1/logs${path}`, { headers: authHeader() });
}

export async function fetchLogs(): Promise<ConsoleEmailLog[]> {
  const response = await logRequest("");
  if (!response.ok) throw new Error(await readError(response));
  return ((await response.json()) as LogPayload[]).map(fromPayload);
}

export async function fetchLog(id: string): Promise<ConsoleEmailLog | null> {
  const response = await logRequest(`/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return fromPayload((await response.json()) as LogPayload);
}

export function filterLogs(
  logs: ConsoleEmailLog[],
  query: string,
  status: EmailStatus | "all",
): ConsoleEmailLog[] {
  const needle = query.trim().toLowerCase();
  return logs.filter((log) => {
    if (status !== "all" && log.status !== status) return false;
    if (!needle) return true;
    const haystack = [
      log.messageId,
      log.subject,
      log.from,
      log.domain,
      log.provider ?? "",
      log.apiKeyPrefix,
      String(log.httpStatus),
      log.method,
      log.text,
      log.kind,
      ...log.to,
      ...log.cc,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}


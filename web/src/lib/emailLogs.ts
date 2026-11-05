import { readJsonStorage, storedObjects, writeJsonStorage } from "./safeStorage";

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

export type ConsoleEmailLog = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  status: EmailStatus;
  domain: string;
  apiKeyPrefix: string;
  errorMessage: string | null;
  /** HTML body sent to SES. */
  html: string;
  /** Plain-text alternative. */
  text: string;
  createdAt: string;
  sentAt: string | null;
};

const STORAGE_KEY = "envoy.console.email-logs.v2";

function isLogArray(value: unknown): value is ConsoleEmailLog[] {
  return Array.isArray(value);
}

const BODY_BY_ID: Record<string, string[]> = {
  "log-8k2q": [
    "Hello,",
    "Invoice 2048 for March is ready. Amount due: $1,240.00.",
    "Pay before the 15th to avoid a late fee.",
  ],
  "log-7n1p": [
    "We received a request to reset your password.",
    "This link expires in 30 minutes. If you did not ask for this, ignore the message.",
  ],
  "log-6m0o": [
    "Welcome to Acme.",
    "Your sending domain is pending DKIM verification.",
  ],
  "log-5c9a": [
    "This week: 1,240 delivered, 4 bounces, 1 complaint.",
    "Open the console to review suppressed addresses.",
  ],
  "log-4b8z": [
    "This welcome was not sent.",
    "The recipient is already on the suppression list.",
  ],
  "log-3a7y": [
    "Your CSV export is queued.",
    "We will email a download link as soon as SES accepts the message.",
  ],
  "log-2z6x": [
    "The on-call alert could not be delivered.",
    "Amazon SES did not respond before the request timed out.",
  ],
};

function withBody(log: ConsoleEmailLog): ConsoleEmailLog {
  if (log.html && log.text) return log;
  const paragraphs = BODY_BY_ID[log.id] ?? [
    log.subject,
    "This event has no stored body yet.",
  ];
  return { ...log, ...messageBody(paragraphs) };
}

export function readStoredLogs(): ConsoleEmailLog[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isLogArray);
  if (!parsed) return seedLogs();
  const records = storedObjects(parsed);
  const next = records.map(withBody);
  const missing = next.some((log, index) => log.html !== records[index]?.html);
  if (missing) writeStoredLogs(next);
  return next;
}

export function writeStoredLogs(logs: ConsoleEmailLog[]) {
  writeJsonStorage(localStorage, STORAGE_KEY, logs);
}

export function getStoredLog(id: string): ConsoleEmailLog | null {
  return readStoredLogs().find((log) => log.id === id) ?? null;
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
      log.apiKeyPrefix,
      log.text,
      ...log.to,
      ...log.cc,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function messageBody(paragraphs: string[]): { html: string; text: string } {
  const text = paragraphs.join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Inter,sans-serif;color:#171717;font-size:14px;line-height:1.6;background:#fff">${paragraphs
    .map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph)}</p>`)
    .join("")}</body></html>`;
  return { html, text };
}

function seedLogs(): ConsoleEmailLog[] {
  const seed: ConsoleEmailLog[] = [
    {
      id: "log-8k2q",
      messageId: "msg_8k2q",
      from: "billing@mail.acme.io",
      to: ["ops@acme.io"],
      cc: ["finance@acme.io"],
      subject: "Invoice 2048",
      ...messageBody(BODY_BY_ID["log-8k2q"]!),
      status: "delivered",
      domain: "mail.acme.io",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: null,
      createdAt: hoursAgo(0.15),
      sentAt: hoursAgo(0.14),
    },
    {
      id: "log-7n1p",
      messageId: "msg_7n1p",
      from: "auth@notify.openrich.app",
      to: ["hello@client.io"],
      cc: [],
      subject: "Password reset",
      ...messageBody(BODY_BY_ID["log-7n1p"]!),
      status: "sent",
      domain: "notify.openrich.app",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: null,
      createdAt: hoursAgo(1.2),
      sentAt: hoursAgo(1.19),
    },
    {
      id: "log-6m0o",
      messageId: "msg_6m0o",
      from: "hello@mail.acme.io",
      to: ["bad@trap.test"],
      cc: [],
      subject: "Welcome",
      ...messageBody(BODY_BY_ID["log-6m0o"]!),
      status: "bounced",
      domain: "mail.acme.io",
      apiKeyPrefix: "envoy_test_p5r9d0n3…",
      errorMessage: "550 5.1.1 The email account does not exist.",
      createdAt: hoursAgo(3),
      sentAt: hoursAgo(2.9),
    },
    {
      id: "log-5c9a",
      messageId: "msg_5c9a",
      from: "news@mail.acme.io",
      to: ["spam@report.io"],
      cc: [],
      subject: "Weekly digest",
      ...messageBody(BODY_BY_ID["log-5c9a"]!),
      status: "complained",
      domain: "mail.acme.io",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: "Recipient marked this message as spam.",
      createdAt: hoursAgo(8),
      sentAt: hoursAgo(7.9),
    },
    {
      id: "log-4b8z",
      messageId: "msg_4b8z",
      from: "hello@mail.acme.io",
      to: ["blocked@suppression.list"],
      cc: [],
      subject: "Retry welcome",
      ...messageBody(BODY_BY_ID["log-4b8z"]!),
      status: "suppressed",
      domain: "mail.acme.io",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: "Recipient is on the suppression list (hard bounce).",
      createdAt: hoursAgo(12),
      sentAt: null,
    },
    {
      id: "log-3a7y",
      messageId: "msg_3a7y",
      from: "jobs@notify.openrich.app",
      to: ["queue@worker.dev"],
      cc: [],
      subject: "Export ready",
      ...messageBody(BODY_BY_ID["log-3a7y"]!),
      status: "queued",
      domain: "notify.openrich.app",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: null,
      createdAt: hoursAgo(0.02),
      sentAt: null,
    },
    {
      id: "log-2z6x",
      messageId: "msg_2z6x",
      from: "alerts@mail.acme.io",
      to: ["oncall@acme.io"],
      cc: [],
      subject: "SES timeout",
      ...messageBody(BODY_BY_ID["log-2z6x"]!),
      status: "failed",
      domain: "mail.acme.io",
      apiKeyPrefix: "envoy_live_7kQe2mR9…",
      errorMessage: "SES SendEmail timed out after 8s.",
      createdAt: hoursAgo(26),
      sentAt: null,
    },
  ];
  writeStoredLogs(seed);
  return seed;
}

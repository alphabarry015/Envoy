import { fetchLog, fetchLogs, type ConsoleEmailLog, type HttpMethod } from "./emailLogs";

export const MAIL_STATUSES = [
  "delivered",
  "sent",
  "bounced",
  "suppressed",
  "complained",
  "clicked",
  "failed",
  "queued",
] as const;

export type MailStatus = (typeof MAIL_STATUSES)[number];

export type MailDirection = "all" | "sent" | "received";

export type ConsoleEmail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: MailStatus;
  /** POST is a message this workspace sent. GET is a message it received. */
  method: HttpMethod;
  text: string;
  sentAt: string;
};

function emailFromLog(log: ConsoleEmailLog): ConsoleEmail {
  const status = ((MAIL_STATUSES as readonly string[]).includes(log.status) ? log.status : "sent") as MailStatus;
  return {
    id: log.id,
    from: log.from,
    to: log.to.join(", ") || "—",
    subject: log.subject,
    status,
    method: "POST",
    text: log.text || "This send has no stored message body.",
    sentAt: log.sentAt ?? log.createdAt,
  };
}

export async function fetchEmails(): Promise<ConsoleEmail[]> {
  return (await fetchLogs()).map(emailFromLog);
}

export async function fetchEmail(id: string): Promise<ConsoleEmail | null> {
  const log = await fetchLog(id);
  return log ? emailFromLog(log) : null;
}

export function filterEmails(
  emails: ConsoleEmail[],
  query: string,
  direction: MailDirection,
  status: MailStatus | "all",
): ConsoleEmail[] {
  const needle = query.trim().toLowerCase();
  return emails.filter((email) => {
    if (direction === "sent" && email.method !== "POST") return false;
    if (direction === "received" && email.method !== "GET") return false;
    if (status !== "all" && email.status !== status) return false;
    if (!needle) return true;
    const haystack = [email.to, email.from, email.subject, email.status, email.method, email.text]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function formatSentAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const delta = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

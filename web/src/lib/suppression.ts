import { readJsonStorage, storedObjects, writeJsonStorage } from "./safeStorage";

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

const STORAGE_KEY = "envoy.console.suppression.v1";

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

function isEntryArray(value: unknown): value is SuppressionEntry[] {
  return Array.isArray(value);
}

export function readStoredSuppressions(): SuppressionEntry[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isEntryArray);
  if (!parsed) return seedSuppressions();
  return storedObjects(parsed);
}

export function writeStoredSuppressions(entries: SuppressionEntry[]) {
  writeJsonStorage(localStorage, STORAGE_KEY, entries);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedSuppressions(): SuppressionEntry[] {
  return [
    {
      id: "sup-bounce",
      email: "bad@trap.test",
      reason: "hard_bounce",
      source: "sns",
      createdAt: hoursAgo(3),
    },
    {
      id: "sup-complaint",
      email: "spam@report.io",
      reason: "complaint",
      source: "sns",
      createdAt: hoursAgo(8),
    },
    {
      id: "sup-blocked",
      email: "blocked@suppression.list",
      reason: "hard_bounce",
      source: "sns",
      createdAt: hoursAgo(20),
    },
    {
      id: "sup-unsub",
      email: "lea@client.io",
      reason: "unsubscribe",
      source: "sns",
      createdAt: hoursAgo(30),
    },
    {
      id: "sup-manual",
      email: "old-billing@acme.io",
      reason: "manual",
      source: "manual",
      createdAt: hoursAgo(72),
    },
  ];
}

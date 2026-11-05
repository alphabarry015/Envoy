import { readJsonStorage, storedObjects, writeJsonStorage } from "./safeStorage";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "pending" | "suspended";

export const DOMAIN_QUOTA_OPTIONS = [1, 2, 5, 10] as const;

export type ConsoleUser = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Max sending domains; null = unlimited. */
  domainQuota: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  apiKeysEnabled: boolean;
  invitedAt: string;
  expiresAt: string | null;
};

export type InviteDraft = {
  email: string;
  role: UserRole;
  domainQuota: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  apiKeysEnabled: boolean;
  expiresInHours: 24 | 48;
};

const STORAGE_KEY = "envoy.console.users.v1";

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomToken(length: number): string {
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

export function createInvite(input: InviteDraft): {
  user: ConsoleUser;
  token: string;
} {
  const now = new Date();
  const expires = new Date(
    now.getTime() + input.expiresInHours * 60 * 60 * 1000,
  );
  return {
    token: `env_invite_${randomToken(24)}`,
    user: {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      status: "pending",
      domainQuota: input.domainQuota,
      dailyQuota: input.dailyQuota,
      monthlyQuota: input.monthlyQuota,
      apiKeysEnabled: input.apiKeysEnabled,
      invitedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    },
  };
}

function isUserArray(value: unknown): value is ConsoleUser[] {
  return Array.isArray(value);
}

export function readStoredUsers(): ConsoleUser[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isUserArray);
  if (!parsed) return seedUsers();
  return storedObjects(parsed);
}

export function writeStoredUsers(users: ConsoleUser[]) {
  writeJsonStorage(localStorage, STORAGE_KEY, users);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hoursAhead(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function seedUsers(): ConsoleUser[] {
  return [
    {
      id: "user-admin",
      email: "admin@acme.io",
      role: "admin",
      status: "active",
      domainQuota: 5,
      dailyQuota: 5_000,
      monthlyQuota: 100_000,
      apiKeysEnabled: true,
      invitedAt: hoursAgo(720),
      expiresAt: null,
    },
    {
      id: "user-dev",
      email: "dev@acme.io",
      role: "member",
      status: "active",
      domainQuota: 2,
      dailyQuota: 1_000,
      monthlyQuota: 10_000,
      apiKeysEnabled: true,
      invitedAt: hoursAgo(240),
      expiresAt: null,
    },
    {
      id: "user-partner",
      email: "new@partner.io",
      role: "member",
      status: "pending",
      domainQuota: 1,
      dailyQuota: 1_000,
      monthlyQuota: 10_000,
      apiKeysEnabled: false,
      invitedAt: hoursAgo(2),
      expiresAt: hoursAhead(46),
    },
  ];
}

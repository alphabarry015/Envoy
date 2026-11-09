import { apiBase as apiUrl } from "./apiBase";
import { readJsonStorage, removeStorage, writeJsonStorage } from "./safeStorage";

const STORAGE_KEY = "envoy.console.session";

export type ConsoleSession = {
  email: string;
  signedInAt: string;
  accessToken: string;
};

function isSession(value: unknown): value is ConsoleSession {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.email === "string" &&
    typeof record.signedInAt === "string" &&
    typeof record.accessToken === "string" &&
    record.accessToken.length > 0
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return "Authentication failed.";
}

export function readSession(): ConsoleSession | null {
  return readJsonStorage(sessionStorage, STORAGE_KEY, isSession);
}

function storeSession(email: string, accessToken: string): ConsoleSession {
  const session: ConsoleSession = {
    email: email.trim().toLowerCase(),
    signedInAt: new Date().toISOString(),
    accessToken,
  };
  writeJsonStorage(sessionStorage, STORAGE_KEY, session);
  return session;
}

export async function signIn(email: string, password: string): Promise<ConsoleSession> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !password) {
    throw new Error("Email and password are required.");
  }
  const response = await fetch(`${apiUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trimmed, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const body = (await response.json()) as { access_token?: string; user?: { email?: string } };
  if (!body.access_token) {
    throw new Error("Authentication failed.");
  }
  return storeSession(body.user?.email || trimmed, body.access_token);
}

export async function acceptInvite(
  token: string,
  password: string,
  passwordConfirm: string,
): Promise<ConsoleSession> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: token.trim(),
      password,
      password_confirm: passwordConfirm,
    }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const body = (await response.json()) as { access_token?: string; user?: { email?: string } };
  if (!body.access_token || !body.user?.email) {
    throw new Error("Authentication failed.");
  }
  return storeSession(body.user.email, body.access_token);
}

export function authHeader(): HeadersInit {
  const session = readSession();
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export function replaceAccessToken(accessToken: string) {
  const session = readSession();
  if (!session || !accessToken) return;
  writeJsonStorage(sessionStorage, STORAGE_KEY, { ...session, accessToken });
}

export function signOut() {
  removeStorage(sessionStorage, STORAGE_KEY);
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await fetch(`${apiUrl()}/api/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: authHeader(),
    });
  } finally {
    signOut();
  }
}

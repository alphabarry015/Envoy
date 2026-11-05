import { readJsonStorage, removeStorage, writeJsonStorage } from "./safeStorage";

const STORAGE_KEY = "envoy.console.session";

export type ConsoleSession = {
  email: string;
  signedInAt: string;
};

function isSession(value: unknown): value is ConsoleSession {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.email === "string" && typeof record.signedInAt === "string";
}

export function readSession(): ConsoleSession | null {
  return readJsonStorage(sessionStorage, STORAGE_KEY, isSession);
}

/**
 * Dev-only UI gate — NOT production auth.
 * Any non-empty email + password opens the console mock.
 * Replace with JWT / invite flow before shipping.
 */
export function signIn(email: string, password: string): ConsoleSession {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !password) {
    throw new Error("Email and password are required.");
  }
  const session: ConsoleSession = {
    email: trimmed,
    signedInAt: new Date().toISOString(),
  };
  writeJsonStorage(sessionStorage, STORAGE_KEY, session);
  return session;
}

export function signOut() {
  removeStorage(sessionStorage, STORAGE_KEY);
}

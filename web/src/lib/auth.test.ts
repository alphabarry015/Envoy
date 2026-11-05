import { beforeEach, describe, expect, it } from "vitest";

import { readSession, signIn, signOut } from "./auth";

describe("auth mock gate", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("rejects empty credentials", () => {
    expect(() => signIn("", "x")).toThrow();
    expect(() => signIn("a@b.co", "")).toThrow();
  });

  it("stores and clears a session", () => {
    const session = signIn("Admin@Acme.IO", "any");
    expect(session.email).toBe("admin@acme.io");
    expect(readSession()?.email).toBe("admin@acme.io");
    signOut();
    expect(readSession()).toBeNull();
  });
});

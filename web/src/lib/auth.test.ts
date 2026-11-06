import { beforeEach, describe, expect, it, vi } from "vitest";

import { readSession, signIn, signOut } from "./auth";

describe("console session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv("VITE_API_URL", "http://localhost:8000");
  });

  it("rejects empty credentials", async () => {
    await expect(signIn("", "x")).rejects.toThrow();
    await expect(signIn("a@b.co", "")).rejects.toThrow();
  });

  it("stores the API token and clears the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "jwt-token",
          user: { email: "admin@acme.io" },
        }),
      }),
    );
    const session = await signIn("Admin@Acme.IO", "correct-horse");
    expect(session.email).toBe("admin@acme.io");
    expect(session.accessToken).toBe("jwt-token");
    expect(readSession()?.accessToken).toBe("jwt-token");
    signOut();
    expect(readSession()).toBeNull();
  });
});

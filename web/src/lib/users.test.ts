import { describe, expect, it } from "vitest";

import { createInvite } from "./users";

describe("createInvite", () => {
  it("issues a pending seat and a one-time env_invite token", () => {
    const { user, token } = createInvite({
      email: "Ops@Partner.IO",
      role: "member",
      domainQuota: 1,
      dailyQuota: 1_000,
      monthlyQuota: null,
      apiKeysEnabled: false,
      expiresInHours: 24,
    });

    expect(user.email).toBe("ops@partner.io");
    expect(user.status).toBe("pending");
    expect(user.monthlyQuota).toBeNull();
    expect(token.startsWith("env_invite_")).toBe(true);
    const hoursLeft =
      (new Date(user.expiresAt ?? 0).getTime() - Date.now()) / 36e5;
    expect(hoursLeft).toBeGreaterThan(23);
    expect(hoursLeft).toBeLessThan(25);
  });
});

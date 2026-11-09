import { describe, expect, it } from "vitest";

import { formatInviteCode } from "./inviteCode";

describe("formatInviteCode", () => {
  it("adds dashes every four characters and uppercases", () => {
    expect(formatInviteCode("abcd")).toBe("ABCD");
    expect(formatInviteCode("abcde")).toBe("ABCD-E");
    expect(formatInviteCode("abcdefghjkmnpqrs")).toBe("ABCD-EFGH-JKMN-PQRS");
  });

  it("ignores spaces and dashes the user types or pastes", () => {
    expect(formatInviteCode(" abcd efgh-jkmn--pqrs ")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(formatInviteCode("ABCD-")).toBe("ABCD");
  });

  it("leaves long legacy tokens untouched", () => {
    const legacy = "abc-DEF_ghi".repeat(4);
    expect(formatInviteCode(legacy)).toBe(legacy);
  });
});

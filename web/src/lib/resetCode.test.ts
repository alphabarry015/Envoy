import { describe, expect, it } from "vitest";

import { formatResetCode, isCompleteResetCode } from "./resetCode";

describe("formatResetCode", () => {
  it("adds the dash after three digits", () => {
    expect(formatResetCode("12")).toBe("12");
    expect(formatResetCode("123")).toBe("123");
    expect(formatResetCode("1234")).toBe("123-4");
    expect(formatResetCode("123456")).toBe("123-456");
  });

  it("drops letters, spaces and extra digits", () => {
    expect(formatResetCode(" 12a3-45 6789")).toBe("123-456");
    expect(formatResetCode("123-")).toBe("123");
  });

  it("knows when the code is complete", () => {
    expect(isCompleteResetCode("123-45")).toBe(false);
    expect(isCompleteResetCode("123-456")).toBe(true);
  });
});

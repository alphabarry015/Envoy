import { describe, expect, it } from "vitest";

import { formatRemaining } from "./AccessCountdown";

describe("formatRemaining", () => {
  it("shows days, hours, minutes and seconds", () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(formatRemaining(ms)).toBe("2d 03h 04m 05s");
  });

  it("drops days under 24 hours", () => {
    expect(formatRemaining((5 * 60 + 9) * 1000)).toBe("00h 05m 09s");
  });

  it("never goes below zero", () => {
    expect(formatRemaining(-5000)).toBe("00h 00m 00s");
  });
});

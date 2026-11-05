import { describe, expect, it } from "vitest";

import {
  createApiKey,
  formatQuota,
  generateApiKeySecret,
} from "./apiKeys";

describe("generateApiKeySecret", () => {
  it("prefixes live and sandbox secrets", () => {
    expect(generateApiKeySecret("live").startsWith("envoy_live_")).toBe(true);
    expect(generateApiKeySecret("sandbox").startsWith("envoy_test_")).toBe(
      true,
    );
  });
});

describe("createApiKey", () => {
  it("never persists secret in the returned stored view fields", () => {
    const key = createApiKey({
      name: "CI",
      mode: "live",
      scopes: ["send"],
      dailyQuota: 1000,
      monthlyQuota: 10_000,
    });
    expect(key.secret).toBeTruthy();
    expect(key.prefix.endsWith("…")).toBe(true);
    expect(key.scopes).toEqual(["send"]);
    expect(key.status).toBe("active");
  });

  it("defaults to send when scopes empty", () => {
    const key = createApiKey({
      name: "Empty scopes",
      mode: "live",
      scopes: [],
      dailyQuota: null,
      monthlyQuota: null,
    });
    expect(key.scopes).toEqual(["send"]);
    expect(key.dailyQuota).toBeNull();
  });
});

describe("formatQuota", () => {
  it("formats numbers and unlimited", () => {
    expect(formatQuota(null)).toBe("∞");
    expect(formatQuota(5000)).toBe("5,000");
  });
});

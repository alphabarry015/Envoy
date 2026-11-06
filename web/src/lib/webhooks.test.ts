import { describe, expect, it } from "vitest";

import { createWebhook, generateWebhookSecret, normalizeWebhookUrl } from "./webhooks";

describe("normalizeWebhookUrl", () => {
  it("accepts https and local http endpoints", () => {
    expect(normalizeWebhookUrl("https://hooks.acme.io/envoy")).toBe("https://hooks.acme.io/envoy");
    expect(normalizeWebhookUrl("http://localhost:4000/hooks")).toBe("http://localhost:4000/hooks");
    expect(normalizeWebhookUrl("http://hooks.acme.io/envoy")).toBeNull();
    expect(normalizeWebhookUrl("not a url")).toBeNull();
  });
});

describe("createWebhook", () => {
  it("returns a one-time signing secret and a stored prefix", () => {
    const webhook = createWebhook({
      name: "Billing",
      url: "https://hooks.acme.io/billing",
      events: ["email.bounced"],
    });
    expect(webhook.secret?.startsWith("whsec_")).toBe(true);
    expect(webhook.prefix.endsWith("…")).toBe(true);
    expect(webhook.events).toEqual(["email.bounced"]);
    expect(webhook.status).toBe("active");
  });
});

describe("generateWebhookSecret", () => {
  it("uses the whsec prefix", () => {
    expect(generateWebhookSecret().startsWith("whsec_")).toBe(true);
  });
});

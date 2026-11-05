import { describe, expect, it } from "vitest";

import {
  DOMAIN_PATTERN,
  buildDnsRecords,
  createDomain,
  detectDnsProvider,
  normalizeDomain,
  toDnsCsv,
} from "./domains";

describe("normalizeDomain", () => {
  it("strips protocol, path and trailing dot", () => {
    expect(normalizeDomain("https://Mail.Acme.IO/path")).toBe("mail.acme.io");
    expect(normalizeDomain("notify.openrich.app.")).toBe("notify.openrich.app");
  });
});

describe("DOMAIN_PATTERN", () => {
  it("accepts valid domains", () => {
    expect(DOMAIN_PATTERN.test("mail.acme.io")).toBe(true);
    expect(DOMAIN_PATTERN.test("a.co")).toBe(true);
  });

  it("rejects invalid domains", () => {
    expect(DOMAIN_PATTERN.test("not a domain")).toBe(false);
    expect(DOMAIN_PATTERN.test("-bad.com")).toBe(false);
    expect(DOMAIN_PATTERN.test("localhost")).toBe(false);
  });
});

describe("buildDnsRecords", () => {
  it("returns DKIM, SPF and DMARC records", () => {
    const records = buildDnsRecords("mail.acme.io");
    expect(records).toHaveLength(5);
    expect(records.filter((r) => r.purpose === "DKIM")).toHaveLength(3);
    expect(records.some((r) => r.purpose === "SPF")).toBe(true);
    expect(records.some((r) => r.purpose === "DMARC")).toBe(true);
  });
});

describe("detectDnsProvider", () => {
  it("maps Cloudflare NS", () => {
    expect(
      detectDnsProvider("example.com", ["ada.ns.cloudflare.com"]),
    ).toBe("Cloudflare");
  });

  it("falls back to Other for unknown NS", () => {
    expect(detectDnsProvider("example.com", ["ns1.unknown.example"])).toBe(
      "Other",
    );
  });
});

describe("createDomain / toDnsCsv", () => {
  it("creates a pending domain with CSV export", () => {
    const domain = createDomain("mail.acme.io");
    expect(domain.status).toBe("pending");
    expect(domain.provider.length).toBeGreaterThan(0);
    const csv = toDnsCsv(domain);
    expect(csv.startsWith("Type,Name,Value,TTL,Purpose")).toBe(true);
    expect(csv).toContain("DKIM");
  });
});

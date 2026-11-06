import { describe, expect, it } from "vitest";

import { filterLogs, type ConsoleEmailLog } from "./emailLogs";

const sample: ConsoleEmailLog[] = [
  {
    id: "1",
    messageId: "msg_a",
    from: "a@mail.acme.io",
    to: ["ops@acme.io"],
    cc: [],
    subject: "Invoice",
    html: "<p>Invoice</p>",
    text: "Invoice",
    status: "delivered",
    httpStatus: 200,
    method: "POST",
    domain: "mail.acme.io",
    apiKeyPrefix: "envoy_live_x…",
    errorMessage: null,
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
  },
  {
    id: "2",
    messageId: "msg_b",
    from: "a@mail.acme.io",
    to: ["bad@trap.test"],
    cc: [],
    subject: "Welcome",
    html: "<p>Welcome</p>",
    text: "Welcome",
    status: "bounced",
    httpStatus: 200,
    method: "POST",
    domain: "mail.acme.io",
    apiKeyPrefix: "envoy_test_y…",
    errorMessage: "550",
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
  },
];

describe("filterLogs", () => {
  it("filters by status", () => {
    expect(filterLogs(sample, "", "bounced")).toHaveLength(1);
  });

  it("searches recipient and subject", () => {
    expect(filterLogs(sample, "invoice", "all")).toHaveLength(1);
    expect(filterLogs(sample, "trap.test", "all")[0]?.messageId).toBe("msg_b");
  });

  it("searches the HTTP method", () => {
    expect(filterLogs(sample, "post", "all")).toHaveLength(2);
    expect(filterLogs(sample, "get", "all")).toHaveLength(0);
  });

  it("searches the HTTP status code", () => {
    expect(filterLogs(sample, "403", "all")).toHaveLength(0);
    expect(filterLogs(sample, "200", "all")).toHaveLength(2);
  });
});

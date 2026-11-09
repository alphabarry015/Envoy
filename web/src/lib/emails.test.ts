import { describe, expect, it } from "vitest";

import { filterEmails, formatSentAgo, type ConsoleEmail } from "./emails";

const sample: ConsoleEmail[] = [
  {
    id: "1",
    from: "billing@mail.acme.io",
    to: "ops@acme.io",
    subject: "Invoice",
    status: "delivered",
    method: "POST",
    provider: "ses",
    text: "Amount due",
    sentAt: new Date().toISOString(),
    kind: "api",
  },
  {
    id: "2",
    from: "client@northwind.io",
    to: "billing@mail.acme.io",
    subject: "Re: Invoice",
    status: "clicked",
    method: "GET",
    provider: null,
    text: "Thanks",
    sentAt: new Date().toISOString(),
    kind: "api",
  },
  {
    id: "3",
    from: "hello@mail.acme.io",
    to: "blocked@suppression.list",
    subject: "Retry welcome",
    status: "suppressed",
    method: "POST",
    provider: "ses",
    text: "Not sent",
    sentAt: new Date().toISOString(),
    kind: "api",
  },
];

describe("filterEmails", () => {
  it("keeps sent mail on POST and received mail on GET", () => {
    expect(filterEmails(sample, "", "sent", "all").map((email) => email.id)).toEqual(["1", "3"]);
    expect(filterEmails(sample, "", "received", "all").map((email) => email.id)).toEqual(["2"]);
  });

  it("filters by mailbox status", () => {
    expect(filterEmails(sample, "", "all", "clicked")).toHaveLength(1);
    expect(filterEmails(sample, "", "all", "bounced")).toHaveLength(0);
  });

  it("searches recipient and subject", () => {
    expect(filterEmails(sample, "suppression", "all", "all")[0]?.subject).toBe("Retry welcome");
  });
});

describe("formatSentAgo", () => {
  const now = Date.parse("2026-11-05T20:00:00.000Z");

  it("describes how long ago a message was sent", () => {
    expect(formatSentAgo("2026-11-05T19:51:00.000Z", now)).toBe("9 min ago");
    expect(formatSentAgo("2026-11-05T18:00:00.000Z", now)).toBe("2 hours ago");
    expect(formatSentAgo("2026-11-04T20:00:00.000Z", now)).toBe("1 day ago");
    expect(formatSentAgo(null, now)).toBe("—");
  });
});

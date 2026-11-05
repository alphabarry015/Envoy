import { describe, expect, it } from "vitest";

import { createSuppression, filterSuppressions } from "./suppression";

describe("createSuppression", () => {
  it("stores a manual block with a normalized email", () => {
    const entry = createSuppression("Ops@Trap.TEST", "hard_bounce");
    expect(entry.email).toBe("ops@trap.test");
    expect(entry.reason).toBe("hard_bounce");
    expect(entry.source).toBe("manual");
  });
});

describe("filterSuppressions", () => {
  const entries = [
    createSuppression("a@trap.test", "hard_bounce"),
    createSuppression("b@report.io", "complaint"),
  ];

  it("filters by reason and email", () => {
    expect(filterSuppressions(entries, "", "complaint")).toHaveLength(1);
    expect(filterSuppressions(entries, "trap", "all")).toHaveLength(1);
    expect(filterSuppressions(entries, "missing", "all")).toHaveLength(0);
  });
});

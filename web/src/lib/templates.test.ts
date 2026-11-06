import { describe, expect, it } from "vitest";

import { createTemplate, extractVariables, slugAlias } from "./templates";

describe("slugAlias", () => {
  it("builds a stable alias from a name", () => {
    expect(slugAlias(" Password Reset! ")).toBe("password-reset");
  });
});

describe("extractVariables", () => {
  it("collects unique placeholders from subject, html and text", () => {
    expect(
      extractVariables({
        subject: "Hello {{name}}",
        html: "<p>{{amount}}</p><p>{{ name }}</p>",
        text: "{{due_date}}",
      }),
    ).toEqual(["amount", "due_date", "name"]);
  });
});

describe("createTemplate", () => {
  it("starts as a draft addressed by alias", () => {
    const template = createTemplate("Invoice", "Invoice 2048");
    expect(template.alias).toBe("invoice-2048");
    expect(template.status).toBe("draft");
    expect(template.fromEmail).toBe("");
    expect(template.html).toBe("");
  });
});

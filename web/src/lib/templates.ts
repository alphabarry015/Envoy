import { readJsonStorage, storedObjects, writeJsonStorage } from "./safeStorage";

export type TemplateStatus = "draft" | "published";

export type VariableType = "string" | "number" | "date";

export type TemplateVariable = {
  name: string;
  type: VariableType;
  fallback: string;
};

export type ConsoleTemplate = {
  id: string;
  name: string;
  alias: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  previewText: string;
  status: TemplateStatus;
  variables: TemplateVariable[];
  /** TipTap document. Null until the visual editor saves one. */
  document: object | null;
  updatedAt: string;
};

const STORAGE_KEY = "envoy.console.templates.v1";
const VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const EMPTY_META = {
  fromName: "Acme",
  fromEmail: "acme@example.com",
  replyTo: "",
  previewText: "",
  status: "draft" as const,
  variables: [] as TemplateVariable[],
  document: null,
};

export function slugAlias(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractVariables(
  template: Pick<ConsoleTemplate, "subject" | "html" | "text">,
): string[] {
  const found = new Set<string>();
  for (const source of [template.subject, template.html, template.text]) {
    for (const match of source.matchAll(VARIABLE)) {
      found.add(match[1]!);
    }
  }
  return [...found].sort();
}

export function createTemplate(name: string, alias: string): ConsoleTemplate {
  const label = name.trim();
  return {
    id: crypto.randomUUID(),
    name: label,
    alias: slugAlias(alias || label),
    subject: "",
    html: "",
    text: "",
    ...EMPTY_META,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<TemplateVariable>;
    if (typeof record.name !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(record.name)) {
      return [];
    }
    const type: VariableType =
      record.type === "number" || record.type === "date" ? record.type : "string";
    return [
      {
        name: record.name,
        type,
        fallback: typeof record.fallback === "string" ? record.fallback : "",
      },
    ];
  });
}

function isTemplateArray(value: unknown): value is ConsoleTemplate[] {
  return Array.isArray(value);
}

function normalize(template: ConsoleTemplate): ConsoleTemplate {
  return {
    ...EMPTY_META,
    ...template,
    fromName: template.fromName || EMPTY_META.fromName,
    fromEmail: template.fromEmail || EMPTY_META.fromEmail,
    replyTo: template.replyTo ?? "",
    previewText: template.previewText ?? "",
    status: template.status === "published" ? "published" : "draft",
    variables: normalizeVariables(template.variables),
    document:
      template.document && typeof template.document === "object"
        ? template.document
        : null,
  };
}

export function readStoredTemplates(): ConsoleTemplate[] {
  const parsed = readJsonStorage(localStorage, STORAGE_KEY, isTemplateArray);
  if (!parsed) return seedTemplates();
  return storedObjects(parsed).map(normalize);
}

export function writeStoredTemplates(templates: ConsoleTemplate[]): boolean {
  return writeJsonStorage(localStorage, STORAGE_KEY, templates);
}

export function getStoredTemplate(id: string): ConsoleTemplate | null {
  return readStoredTemplates().find((template) => template.id === id) ?? null;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedTemplates(): ConsoleTemplate[] {
  return [
    {
      id: "tpl-invoice",
      name: "Invoice",
      alias: "invoice",
      subject: "Invoice {{invoice_number}}",
      html: `<p>Hello {{name}},</p><p>Invoice {{invoice_number}} is ready. Amount due: {{amount}}.</p><p>Pay before {{due_date}}.</p>`,
      text: "Hello {{name}},\n\nInvoice {{invoice_number}} is ready. Amount due: {{amount}}.\n\nPay before {{due_date}}.",
      updatedAt: hoursAgo(6),
      ...EMPTY_META,
      variables: [
        { name: "name", type: "string", fallback: "" },
        { name: "invoice_number", type: "string", fallback: "" },
        { name: "amount", type: "string", fallback: "" },
        { name: "due_date", type: "string", fallback: "" },
      ],
    },
    {
      id: "tpl-reset",
      name: "Password reset",
      alias: "password-reset",
      subject: "Reset your password",
      html: `<p>Hello {{name}},</p><p>Reset your password: {{reset_url}}</p><p>This link expires in {{expires_in}}.</p>`,
      text: "Hello {{name}},\n\nReset your password: {{reset_url}}\n\nThis link expires in {{expires_in}}.",
      updatedAt: hoursAgo(30),
      ...EMPTY_META,
      variables: [
        { name: "name", type: "string", fallback: "" },
        { name: "reset_url", type: "string", fallback: "" },
        { name: "expires_in", type: "string", fallback: "" },
      ],
    },
    {
      id: "tpl-welcome",
      name: "Welcome",
      alias: "welcome",
      subject: "Welcome to {{workspace}}",
      html: `<p>Hello {{name}},</p><p>Your workspace {{workspace}} is ready.</p>`,
      text: "Hello {{name}},\n\nYour workspace {{workspace}} is ready.",
      updatedAt: hoursAgo(80),
      ...EMPTY_META,
      variables: [
        { name: "name", type: "string", fallback: "" },
        { name: "workspace", type: "string", fallback: "" },
      ],
    },
  ];
}

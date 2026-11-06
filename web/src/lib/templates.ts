import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

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

const VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const EMPTY_META = {
  fromName: "",
  fromEmail: "",
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

type TemplatePayload = {
  id: string;
  name: string;
  alias: string;
  subject: string;
  html: string;
  text: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  preview_text: string;
  status: TemplateStatus;
  variables: TemplateVariable[];
  document: object | null;
  updated_at: string;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* réponse non JSON */
  }
  return fallback;
}

function fromPayload(row: TemplatePayload): ConsoleTemplate {
  return normalize({
    id: row.id,
    name: row.name,
    alias: row.alias,
    subject: row.subject,
    html: row.html,
    text: row.text,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    previewText: row.preview_text,
    status: row.status,
    variables: row.variables,
    document: row.document,
    updatedAt: row.updated_at,
  });
}

function toPayload(template: ConsoleTemplate) {
  return {
    name: template.name.trim() || "Untitled Template",
    alias: template.alias,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from_name: template.fromName,
    from_email: template.fromEmail,
    reply_to: template.replyTo,
    preview_text: template.previewText,
    status: template.status,
    variables: template.variables,
    document: template.document,
  };
}

async function templateRequest(path: string, init: RequestInit): Promise<Response> {
  const baseUrl = apiUrl();
  const headers = new Headers(init.headers);
  new Headers(authHeader()).forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}/api/v1/templates${path}`, { ...init, headers });
}

export async function fetchTemplates(): Promise<ConsoleTemplate[]> {
  const response = await templateRequest("", { method: "GET" });
  if (!response.ok) throw new Error(await readError(response, "Could not load templates."));
  return ((await response.json()) as TemplatePayload[]).map(fromPayload);
}

export async function fetchTemplate(id: string): Promise<ConsoleTemplate | null> {
  const response = await templateRequest(`/${id}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response, "Could not load this template."));
  return fromPayload((await response.json()) as TemplatePayload);
}

export async function createRemoteTemplate(template: ConsoleTemplate): Promise<ConsoleTemplate> {
  const response = await templateRequest("", {
    method: "POST",
    body: JSON.stringify(toPayload(template)),
  });
  if (!response.ok) throw new Error(await readError(response, "Could not create this template."));
  return fromPayload((await response.json()) as TemplatePayload);
}

export async function updateRemoteTemplate(template: ConsoleTemplate): Promise<ConsoleTemplate> {
  const response = await templateRequest(`/${template.id}`, {
    method: "PUT",
    body: JSON.stringify(toPayload(template)),
  });
  if (!response.ok) throw new Error(await readError(response, "Could not save this template."));
  return fromPayload((await response.json()) as TemplatePayload);
}

export async function deleteRemoteTemplate(id: string): Promise<void> {
  const response = await templateRequest(`/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    throw new Error(await readError(response, "Could not delete this template."));
  }
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

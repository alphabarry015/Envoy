import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import { ArrowLeft, Check, CodeXml, Copy } from "lucide-react";

hljs.registerLanguage("xml", xml);

import { BTN_GHOST_SM, BTN_PRIMARY, KICKER } from "../../lib/consoleUi";
import { STARTER_TEMPLATES, type StarterTemplate } from "../../lib/starterTemplates";
import { createRemoteTemplate, createTemplate, fetchTemplates } from "../../lib/templates";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const INVISIBLE =
  /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function readableText(value: string): string {
  return value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function formatStyle(css: string): string {
  const compact = css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  let out = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < compact.length; index += 1) {
    const char = compact[index] ?? "";
    if (quote) {
      out += char;
      if (char === "\\" ) {
        out += compact[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "{") {
      out = `${out.trimEnd()} {\n${"  ".repeat(depth + 1)}`;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
      out = `${out.trimEnd()}\n${"  ".repeat(depth)}}\n${"  ".repeat(depth)}`;
      continue;
    }
    if (char === ";") {
      out = `${out.trimEnd()};\n${"  ".repeat(depth)}`;
      continue;
    }
    out += char;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function serializeNode(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = readableText(node.textContent ?? "");
    return text ? `${"  ".repeat(depth)}${escapeText(text)}\n` : "";
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    const text = readableText(node.textContent ?? "");
    if (!text || text === "$" || text === "/$" || text === "html" || text === "head" || text === "body") {
      return "";
    }
    return `${"  ".repeat(depth)}<!-- ${escapeText(text)} -->\n`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (element.getAttribute("data-skip-in-text") === "true") return "";
  const tag = element.tagName.toLowerCase();
  const attrs = [...element.attributes]
    .filter((attr) => attr.name !== "data-skip-in-text")
    .map((attr) => ` ${attr.name}="${escapeText(attr.value).replace(/"/g, "&quot;")}"`)
    .join("");
  const pad = "  ".repeat(depth);
  if (tag === "style") {
    const css = formatStyle(element.textContent ?? "");
    if (!css) return `${pad}<style></style>\n`;
    const inner = css
      .split("\n")
      .map((line) => `${"  ".repeat(depth + 1)}${line}`)
      .join("\n");
    return `${pad}<style>\n${inner}\n${pad}</style>\n`;
  }
  if (VOID_TAGS.has(tag)) return `${pad}<${tag}${attrs}>\n`;
  const children = [...element.childNodes];
  if (children.every((child) => child.nodeType === Node.TEXT_NODE)) {
    const text = readableText(children.map((child) => child.textContent ?? "").join(""));
    return text ? `${pad}<${tag}${attrs}>${escapeText(text)}</${tag}>\n` : "";
  }
  const inner = children.map((child) => serializeNode(child, depth + 1)).join("");
  if (!inner.trim()) return "";
  return `${pad}<${tag}${attrs}>\n${inner}${pad}</${tag}>\n`;
}

function formatEmailDocument(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const head = [...doc.head.childNodes].map((node) => serializeNode(node, 1)).join("");
  const body = [...doc.body.childNodes].map((node) => serializeNode(node, 1)).join("");
  return `<!DOCTYPE html>\n<html>\n  <head>\n${head}  </head>\n  <body>\n${body}  </body>\n</html>\n`;
}

const GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Barebone",
    ids: [
      "activation",
      "welcome",
      "password-reset",
      "feature-announcement",
      "subscription-confirmation",
    ],
  },
  { label: "Collage", ids: ["matte-welcome", "matte-product-update"] },
  { label: "Dither", ids: ["protocol-activation", "protocol-welcome"] },
  {
    label: "Arcane",
    ids: [
      "arcane-abandoned-cart",
      "arcane-order-confirmation",
      "arcane-newsletter",
      "arcane-promo",
    ],
  },
  { label: "Studio", ids: ["studio-order-shipping", "studio-welcome"] },
  { label: "Magic links", ids: ["notion-magic-link"] },
  { label: "Newsletters", ids: ["stack-overflow-tips"] },
  { label: "Notifications", ids: ["vercel-invite-user"] },
  { label: "Receipts", ids: ["nike-receipt"] },
  { label: "Reset password", ids: ["dropbox-reset-password"] },
  { label: "Reviews", ids: ["airbnb-review"] },
  { label: "Welcome", ids: ["stripe-welcome"] },
  { label: "Text", ids: ["text-only"] },
  { label: "Product update", ids: ["product-update"] },
  { label: "Subscription update", ids: ["subscription-update"] },
];

export default function StarterTemplatesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(STARTER_TEMPLATES[0]?.id ?? "");
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(
    () => new Map(STARTER_TEMPLATES.map((starter) => [starter.id, starter])),
    [],
  );
  const needle = query.trim().toLowerCase();
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.ids
      .map((id) => byId.get(id))
      .filter((starter): starter is StarterTemplate => {
        if (!starter) return false;
        if (!needle) return true;
        return `${starter.name} ${starter.subject}`.toLowerCase().includes(needle);
      }),
  })).filter((group) => group.items.length > 0);
  const visible = groups.flatMap((group) => group.items);
  const selected = visible.find((starter) => starter.id === selectedId) ?? visible[0] ?? null;
  const code = useMemo(() => {
    if (!showCode || !selected) return "";
    return hljs.highlight(formatEmailDocument(selected.html), {
      language: "xml",
      ignoreIllegals: true,
    }).value;
  }, [showCode, selected]);

  async function useStarter(starter: StarterTemplate) {
    setError(null);
    try {
      const taken = (await fetchTemplates()).map((template) => template.alias);
      let alias = starter.alias;
      let suffix = 2;
      while (taken.includes(alias)) {
        alias = `${starter.alias}-${suffix}`;
        suffix += 1;
      }
      const created = await createRemoteTemplate({
        ...createTemplate(starter.name, alias),
        subject: starter.subject,
        previewText: starter.subject,
        html: starter.html,
        text: starter.subject,
      });
      navigate(`/console/templates/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this template.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white md:flex-row">
      <aside className="flex max-h-[42%] w-full shrink-0 flex-col border-b border-neutral-200 bg-neutral-50 md:max-h-none md:w-72 md:border-r md:border-b-0">
        <div className="border-b border-neutral-200 px-4 py-4">
          <Link
            to="/console/templates"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#0A4BD6]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Templates
          </Link>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="mt-4 h-9 w-full rounded-sm border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-[#0A4BD6]"
          />
        </div>
        <nav aria-label="Template models" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {groups.length === 0 ? (
            <p className="px-2 py-2 text-sm text-neutral-500">No templates</p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className={`px-2 pb-1 ${KICKER}`}>{group.label}</p>
                <div className="flex flex-col">
                  {group.items.map((starter) => {
                    const active = starter.id === selected?.id;
                    return (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(starter.id);
                          setCopied(false);
                        }}
                        className={`rounded-sm px-2 py-1.5 text-left text-sm ${
                          active
                            ? "bg-white font-medium text-[#0A4BD6]"
                            : "text-neutral-700 hover:bg-white hover:text-[#0A4BD6]"
                        }`}
                      >
                        {starter.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </nav>
        <div className="border-t border-neutral-200 p-3">
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            className={`${BTN_PRIMARY} w-full`}
            disabled={!selected}
            onClick={() => {
              if (selected) useStarter(selected);
            }}
          >
            Add
          </button>
        </div>
      </aside>
      <div className="relative min-h-0 min-w-0 flex-1 bg-[#F3F4F6]">
        {selected ? (
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            {showCode ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(formatEmailDocument(selected.html)).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className={`${BTN_GHOST_SM} bg-white shadow-sm`}
              >
                {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            <button
              type="button"
              aria-pressed={showCode}
              onClick={() => {
                setCopied(false);
                setShowCode((current) => !current);
              }}
              className={`shadow-sm ${
                showCode
                  ? "inline-flex items-center gap-1.5 rounded-sm bg-[#0A4BD6] px-3 py-1.5 text-xs font-medium text-white"
                  : `${BTN_GHOST_SM} bg-white`
              }`}
            >
              <CodeXml className="size-3.5" aria-hidden="true" />
              Code
            </button>
          </div>
        ) : null}
        {selected && showCode ? (
          <pre className="html-source h-full overflow-auto bg-white px-6 pt-14 pb-8 font-mono text-[12px] leading-5 whitespace-pre text-neutral-950">
            <code dangerouslySetInnerHTML={{ __html: code }} />
          </pre>
        ) : selected ? (
          <iframe
            title={selected.name}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={selected.html}
            className="h-full w-full border-0 bg-[#F3F4F6]"
          />
        ) : null}
      </div>
    </div>
  );
}

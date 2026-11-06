import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import { ArrowLeft, Check, ChevronDown, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

hljs.registerLanguage("xml", xml);

import { type ConsoleEmailLog, fetchLog } from "../../lib/emailLogs";
import { PageLoading } from "../ui/ScanLoading";
import { HttpStatus, MethodBadge, StatusBadge } from "./LogsPanel";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function LogDetailPage() {
  const { logId = "" } = useParams();
  const [log, setLog] = useState<ConsoleEmailLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showHtml, setShowHtml] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCopied(false);
    setDetailsOpen(true);
    setShowHtml(true);
    fetchLog(logId)
      .then((row) => {
        if (!cancelled) setLog(row);
      })
      .catch(() => {
        if (!cancelled) setLog(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logId]);

  if (loading) {
    return (
      <PageLoading>Loading log…</PageLoading>
    );
  }

  if (!log) {
    return <Navigate to="/console/logs" replace />;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/console/logs"
        className="inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-[#0A4BD6]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to logs
      </Link>

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              {log.messageId}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-950 md:text-2xl">
              {log.subject}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <MethodBadge method={log.method} />
            <HttpStatus code={log.httpStatus} />
            <StatusBadge status={log.status} />
          </div>
        </div>

        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-6 flex w-full items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-left"
        >
          <span className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Details
          </span>
          <ChevronDown
            className={`size-4 text-neutral-400 transition-transform ${
              detailsOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {detailsOpen ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Meta label="From" value={log.from} />
          <Meta label="To" value={log.to.join(", ")} />
          <Meta label="Cc" value={log.cc.length > 0 ? log.cc.join(", ") : "—"} />
          <Meta label="Bcc" value={log.bcc && log.bcc.length > 0 ? log.bcc.join(", ") : "—"} />
          <Meta label="SES id" mono value={log.sesMessageId || "—"} />
          <Meta label="Method" value={<MethodBadge method={log.method} />} />
          <Meta label="HTTP" value={<HttpStatus code={log.httpStatus} />} />
          <Meta label="Domain" value={log.domain} />
          <Meta
            label="API key"
            mono
            value={
              <span className="group/cell inline-flex items-center gap-1.5">
                <span>{log.apiKeyPrefix}</span>
                <button
                  type="button"
                  aria-label={copied ? "API key copied" : "Copy API key"}
                  title={copied ? "Copied" : "Copy API key"}
                  onClick={() => {
                    void navigator.clipboard.writeText(log.apiKeyPrefix);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  }}
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-all hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6] ${
                    copied
                      ? "opacity-100"
                      : "opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
                  }`}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              </span>
            }
          />
          <Meta label="Created" value={formatWhen(log.createdAt)} />
          <Meta label="Sent" value={formatWhen(log.sentAt)} />
        </dl>
        ) : null}

        {detailsOpen && log.errorMessage ? (
          <p className="mt-5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {log.errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Message
          </p>
          <div
            role="group"
            aria-label="Message format"
            className="inline-flex rounded-sm border border-neutral-200 bg-white p-0.5"
          >
            <button
              type="button"
              aria-pressed={!showHtml}
              onClick={() => setShowHtml(false)}
              className={`rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase transition-colors ${
                showHtml
                  ? "text-neutral-500 hover:text-[#0A4BD6]"
                  : "bg-[#0A4BD6] text-white"
              }`}
            >
              Text
            </button>
            <button
              type="button"
              aria-pressed={showHtml}
              onClick={() => setShowHtml(true)}
              className={`rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase transition-colors ${
                showHtml
                  ? "bg-[#0A4BD6] text-white"
                  : "text-neutral-500 hover:text-[#0A4BD6]"
              }`}
            >
              HTML
            </button>
          </div>
        </div>
        {!log.html && !log.text ? (
          <p className="text-sm text-neutral-500">This send has no stored message body.</p>
        ) : showHtml ? (
          <HtmlSource html={log.html || "<p>No HTML body.</p>"} />
        ) : (
          <pre className="max-h-64 overflow-auto rounded-sm border border-neutral-200 bg-white p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-neutral-950">
            {log.text || "No text body."}
          </pre>
        )}
      </section>
    </div>
  );
}

function formatHtmlSource(html: string): string {
  const lines = html.replace(/>\s*</g, ">\n<").trim().split("\n");
  let depth = 0;
  return lines
    .map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      const closes = /^<\/[^>]+>/.test(line);
      const selfClosing = /\/>$/.test(line);
      const paired = /^<[^>]+>[\s\S]*<\/[^>]+>$/.test(line);
      const opens = /^<[^/!][^>]*>/.test(line) && !selfClosing && !paired;
      if (closes) depth = Math.max(0, depth - 1);
      const indented = `${"  ".repeat(depth)}${line}`;
      if (opens) depth += 1;
      return indented;
    })
    .join("\n");
}

function HtmlSource({ html }: { html: string }) {
  const code = hljs.highlight(formatHtmlSource(html), {
    language: "xml",
    ignoreIllegals: true,
  }).value;

  return (
    <pre className="html-source max-h-64 overflow-auto rounded-sm border border-neutral-200 bg-white p-4 font-mono text-sm leading-relaxed whitespace-pre text-neutral-950">
      <code dangerouslySetInnerHTML={{ __html: code }} />
    </pre>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-sm text-neutral-800 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

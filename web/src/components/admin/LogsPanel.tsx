import { ChevronRight, Mail, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type ConsoleEmailLog,
  type EmailStatus,
  type HttpMethod,
  EMAIL_STATUSES,
  fetchLogs,
  filterLogs,
} from "../../lib/emailLogs";
import { FIELD } from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";

const FILTERS: Array<EmailStatus | "all"> = ["all", ...EMAIL_STATUSES];

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function LogsPanel() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ConsoleEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EmailStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetchLogs()
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load logs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => filterLogs(logs, query, status), [logs, query, status]);

  if (loading) {
    return <PageLoading>Loading logs…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Search logs</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search message, recipient, subject…"
            className={`${FIELD} w-full pl-11`}
          />
        </label>
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          {FILTERS.map((item) => {
            const active = status === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(item)}
                className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                  active
                    ? "border-[#0A4BD6] bg-[#0A4BD6] text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-[#0A4BD6]/40 hover:text-[#0A4BD6]"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Events · {visible.length} / {logs.length}
          </p>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Mail className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              {logs.length === 0 ? "No messages yet." : "No messages match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[20%]" />
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[3%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-2.5 font-medium">Message</th>
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Subject</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 font-medium">HTTP</th>
                  <th className="px-5 py-2.5 font-medium">Created</th>
                  <th className="px-5 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer border-b border-neutral-200 last:border-0 hover:bg-[#0A4BD6]/5"
                    onClick={() => navigate(`/console/logs/${log.id}`)}
                  >
                    <td className="px-5 py-4 font-mono text-xs text-neutral-700">
                      {log.messageId}
                    </td>
                    <td className="truncate px-5 py-4 text-neutral-800">
                      {log.to.join(", ")}
                    </td>
                    <td className="truncate px-5 py-4 text-neutral-600">
                      {log.subject}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-5 py-4">
                      <MethodBadge method={log.method} />
                    </td>
                    <td className="px-5 py-4">
                      <HttpStatus code={log.httpStatus} />
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500">
                      {formatWhen(log.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ChevronRight
                        className="inline size-4 text-neutral-400"
                        aria-hidden="true"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function MethodBadge({ method }: { method: HttpMethod }) {
  const tone =
    method === "POST"
      ? "bg-[#0A4BD6]/10 text-[#0A4BD6]"
      : "bg-neutral-200/70 text-neutral-600";

  return (
    <span className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${tone}`}>
      {method}
    </span>
  );
}

export function HttpStatus({ code }: { code: number }) {
  const tone =
    code >= 500
      ? "bg-red-50 text-red-600"
      : code >= 400
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <span className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${tone}`}>
      {code}
    </span>
  );
}

export function StatusBadge({ status }: { status: ConsoleEmailLog["status"] }) {
  const tone =
    status === "delivered"
      ? "bg-emerald-50 text-emerald-700"
      : status === "sent"
        ? "bg-[#0A4BD6]/10 text-[#0A4BD6]"
        : status === "bounced"
          ? "bg-orange-50 text-orange-700"
          : status === "complained" || status === "failed"
            ? "bg-red-50 text-red-600"
            : status === "suppressed"
              ? "bg-amber-50 text-amber-700"
              : "bg-neutral-200/70 text-neutral-600";

  return (
    <span className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${tone}`}>
      {status}
    </span>
  );
}

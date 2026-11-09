import { Mail, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { FIELD } from "../../lib/consoleUi";
import { onRealtime } from "../../lib/realtime";
import { PageLoading } from "../ui/ScanLoading";
import {
  type ConsoleEmail,
  type MailDirection,
  type MailStatus,
  MAIL_STATUSES,
  fetchEmails,
  filterEmails,
  formatSentAgo,
} from "../../lib/emails";
import { ProviderBadge } from "./LogsPanel";
const DIRECTIONS: Array<{ id: MailDirection; label: string }> = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
];

const STATUS_FILTERS: Array<MailStatus | "all"> = ["all", ...MAIL_STATUSES];

export default function EmailsPanel() {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<ConsoleEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<MailDirection>("all");
  const [status, setStatus] = useState<MailStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    function load(silent: boolean) {
      fetchEmails()
        .then((rows) => {
          if (!cancelled) {
            setEmails(
              rows
                .slice()
                .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
            );
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled && !silent) {
            setLoadError(cause instanceof Error ? cause.message : "Could not load emails.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load(false);
    let debounce: number | null = null;
    const unsubscribe = onRealtime(["emails.changed", "realtime.ready"], () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => load(true), 800);
    });
    return () => {
      cancelled = true;
      if (debounce != null) window.clearTimeout(debounce);
      unsubscribe();
    };
  }, []);

  const visible = useMemo(
    () => filterEmails(emails, query, direction, status),
    [emails, query, direction, status],
  );

  if (loading) {
    return <PageLoading>Loading emails…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Search emails</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipient, subject…"
            className={`${FIELD} w-full pl-11`}
          />
        </label>
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">
          {DIRECTIONS.map((item) => {
            const active = direction === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setDirection(item.id)}
                className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                  active
                    ? "border-[#0A4BD6] bg-[#0A4BD6] text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-[#0A4BD6]/40 hover:text-[#0A4BD6]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          {STATUS_FILTERS.map((item) => {
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
            Messages · {visible.length} / {emails.length}
          </p>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Mail className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              {emails.length === 0
                ? "No emails yet. Sent messages appear here."
                : direction === "received"
                  ? "Received mail is not connected yet."
                  : "No emails match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[30%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Tool</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Subject</th>
                  <th className="px-5 py-2.5 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((email) => (
                  <tr
                    key={email.id}
                    className="cursor-pointer border-b border-neutral-200 last:border-0 hover:bg-[#0A4BD6]/5"
                    onClick={() => navigate(`/console/emails/${email.id}`)}
                  >
                    <td className="truncate px-5 py-4 text-neutral-800">{email.to}</td>
                    <td className="px-5 py-4">
                      <ProviderBadge provider={email.provider} />
                    </td>
                    <td className="px-5 py-4">
                      <MailStatusBadge status={email.status} />
                    </td>
                    <td className="truncate px-5 py-4 text-neutral-600">{email.subject}</td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500">
                      {formatSentAgo(email.sentAt)}
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

export function MailStatusBadge({ status }: { status: ConsoleEmail["status"] }) {
  const tone =
    status === "delivered"
      ? "bg-emerald-50 text-emerald-700"
      : status === "clicked"
        ? "bg-violet-50 text-violet-700"
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

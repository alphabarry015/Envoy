import { Search, Shield, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";
import {
  type SuppressionEntry,
  type SuppressionReason,
  REASON_LABELS,
  SUPPRESSION_REASONS,
  createRemoteSuppression,
  deleteRemoteSuppression,
  fetchSuppressions,
  filterSuppressions,
} from "../../lib/suppression";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SELECT =
  "h-11 w-full appearance-none rounded-sm border border-neutral-200 bg-neutral-50 bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-4 pr-10 text-sm text-neutral-950 outline-none focus:border-[#0A4BD6] focus:bg-white focus:ring-2 focus:ring-[#0A4BD6]/20";

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const FILTERS: Array<SuppressionReason | "all"> = ["all", ...SUPPRESSION_REASONS];

const REASON_TONE: Record<SuppressionReason, string> = {
  hard_bounce: "bg-orange-50 text-orange-700",
  complaint: "bg-red-50 text-red-600",
  unsubscribe: "bg-amber-50 text-amber-700",
  manual: "bg-neutral-200/70 text-neutral-600",
};

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function SuppressionPanel() {
  const titleId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SuppressionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<SuppressionReason | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nextReason, setNextReason] = useState<SuppressionReason>("manual");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuppressions()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load addresses.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = filterSuppressions(entries, query, reason);

  function closeModal() {
    setModalOpen(false);
    setEmail("");
    setNextReason("manual");
    setError(null);
  }

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => emailRef.current?.focus(), 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen]);

  async function addEntry() {
    const normalized = email.trim().toLowerCase();
    setError(null);
    if (!EMAIL_PATTERN.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    if (entries.some((entry) => entry.email === normalized)) {
      setError("This address is already suppressed.");
      return;
    }
    setSaving(true);
    try {
      const created = await createRemoteSuppression(normalized, nextReason);
      setEntries((current) => [created, ...current]);
      closeModal();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not block this address.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    const previous = entries;
    setEntries((current) => current.filter((entry) => entry.id !== id));
    try {
      await deleteRemoteSuppression(id);
    } catch (cause: unknown) {
      setEntries(previous);
      setLoadError(cause instanceof Error ? cause.message : "Could not remove this address.");
    }
  }

  if (loading) {
    return <PageLoading>Loading addresses…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Hard bounces and complaints from SNS land here. Sends to these
          addresses are blocked before SES.
        </p>
        {loadError ? <p className="w-full text-sm text-red-600">{loadError}</p> : null}
        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
        >
          <Shield className="size-3.5" aria-hidden="true" />
          Add address
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Search suppressed addresses</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email…"
            className={`${FIELD} w-full pl-11`}
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reason">
          {FILTERS.map((item) => {
            const active = reason === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => setReason(item)}
                className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                  active
                    ? "border-[#0A4BD6] bg-[#0A4BD6] text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-[#0A4BD6]/40 hover:text-[#0A4BD6]"
                }`}
              >
                {item === "all" ? "All" : REASON_LABELS[item]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Blocked · {visible.length} / {entries.length}
          </p>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Shield className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              {entries.length === 0
                ? "No suppressed addresses yet."
                : "No addresses match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[20%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Reason</th>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium">Added</th>
                  <th className="px-5 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-neutral-200 last:border-0"
                  >
                    <td className="truncate px-5 py-4 font-mono text-xs text-neutral-800">
                      {entry.email}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${REASON_TONE[entry.reason]}`}
                      >
                        {REASON_LABELS[entry.reason]}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500 uppercase">
                      {entry.source}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500">
                      {formatWhen(entry.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${entry.email}`}
                        title="Remove"
                        onClick={() => removeEntry(entry.id)}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`w-full max-w-lg rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      Suppression
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      Block an address
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Manual entries are rejected on the next send.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={closeModal}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="space-y-5 px-6 py-5">
                  <label className="block">
                    <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                      Email
                    </span>
                    <input
                      ref={emailRef}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addEntry();
                      }}
                      placeholder="user@company.com"
                      className={FIELD_COMPACT}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                      Reason
                    </span>
                    <select
                      value={nextReason}
                      onChange={(event) =>
                        setNextReason(event.target.value as SuppressionReason)
                      }
                      className={SELECT}
                      style={{ backgroundImage: SELECT_CHEVRON }}
                    >
                      {SUPPRESSION_REASONS.map((item) => (
                        <option key={item} value={item}>
                          {REASON_LABELS[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
                  <button type="button" className={BTN_GHOST} onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="button" className={BTN_PRIMARY} onClick={() => void addEntry()} disabled={saving}>
                    {saving ? "Blocking…" : "Block address"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

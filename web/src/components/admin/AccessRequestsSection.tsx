import { Check, Inbox, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  type AccessRequestItem,
  VOLUME_LABELS,
} from "../../lib/accessRequests";
import { BTN_GHOST, BTN_PRIMARY } from "../../lib/consoleUi";

type Props = {
  requests: AccessRequestItem[];
  highlightId: string | null;
  error: string | null;
  onAccept: (item: AccessRequestItem) => void;
  onDecline: (item: AccessRequestItem, notify: boolean) => Promise<void>;
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function AccessRequestsSection({
  requests,
  highlightId,
  error,
  onAccept,
  onDecline,
}: Props) {
  const [showHandled, setShowHandled] = useState(false);
  const pending = requests.filter((item) => item.status === "pending");
  const handled = requests.filter((item) => item.status !== "pending");

  if (requests.length === 0 && !error) return null;

  return (
    <section className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          Access requests · {pending.length} waiting
          {pending.length > 0 ? (
            <span
              className="size-2 rounded-full bg-orange-500"
              aria-hidden="true"
            />
          ) : null}
        </p>
        {handled.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowHandled((value) => !value)}
            className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase transition-colors hover:text-[#0A4BD6]"
          >
            {showHandled ? "Hide handled" : `Show handled (${handled.length})`}
          </button>
        ) : null}
      </div>

      {error ? <p className="px-5 py-4 text-sm text-red-600">{error}</p> : null}

      {pending.length === 0 && !error ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-neutral-500">
          <Inbox className="size-4 text-neutral-300" aria-hidden="true" />
          No request waiting. New ones from the Request access page show up
          here.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {pending.map((item) => (
            <RequestRow
              key={item.id}
              item={item}
              highlighted={item.id === highlightId}
              onAccept={onAccept}
              onDecline={onDecline}
            />
          ))}
        </ul>
      )}

      {showHandled && handled.length > 0 ? (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200 bg-white/60">
          {handled.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="min-w-0 truncate text-neutral-700">
                <span className="font-medium text-neutral-900">
                  {item.fullName}
                </span>{" "}
                · {item.organization} · {item.email}
              </span>
              <span
                className={`rounded-sm px-2 py-0.5 font-mono text-[11px] tracking-widest uppercase ${
                  item.status === "accepted"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RequestRow({
  item,
  highlighted,
  onAccept,
  onDecline,
}: {
  item: AccessRequestItem;
  highlighted: boolean;
  onAccept: (item: AccessRequestItem) => void;
  onDecline: (item: AccessRequestItem, notify: boolean) => Promise<void>;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const long = item.useCase.length > 220;

  useEffect(() => {
    if (highlighted)
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  async function decline() {
    setBusy(true);
    try {
      await onDecline(item, notify);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      ref={ref}
      className={`px-5 py-5 transition-colors ${highlighted ? "bg-[#0A4BD6]/5 ring-1 ring-[#0A4BD6]/30 ring-inset" : ""}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-950">
            {item.fullName}
            <span className="font-normal text-neutral-500">
              {" "}
              · {item.organization}
            </span>
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
            {item.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-sm border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[11px] text-neutral-600">
              {VOLUME_LABELS[item.volume] ?? item.volume}
            </span>
            <span className="rounded-sm border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[11px] text-neutral-400">
              {formatDate(item.createdAt)}
            </span>
          </div>
          <p
            className={`mt-3 border-l-2 border-[#0A4BD6]/40 pl-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-600 ${
              expanded || !long ? "" : "line-clamp-3"
            }`}
          >
            {item.useCase}
          </p>
          {long ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 text-xs font-medium text-[#0A4BD6] hover:underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-52">
          {confirming ? (
            <div className="space-y-3 rounded-sm border border-neutral-200 bg-white p-3">
              <p className="text-sm text-neutral-700">Decline this request?</p>
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                  className="size-3.5 accent-[#0A4BD6]"
                />
                Let them know by email
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decline()}
                  className="flex-1 rounded-sm bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
                >
                  {busy ? "Declining…" : "Decline"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-sm border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onAccept(item)}
                className={`${BTN_PRIMARY} justify-center`}
              >
                <Check className="size-3.5" aria-hidden="true" />
                Accept
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`${BTN_GHOST} justify-center`}
              >
                <X className="size-3.5" aria-hidden="true" />
                Decline
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

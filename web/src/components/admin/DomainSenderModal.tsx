import { Mail, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BTN_GHOST, BTN_PRIMARY, FIELD_COMPACT, PORTAL_SURFACE } from "../../lib/consoleUi";
import { type ConsoleDomain, updateDomainSender } from "../../lib/domains";

const LABEL = "mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase";

export default function DomainSenderModal({
  domain,
  onClose,
  onSaved,
}: {
  domain: ConsoleDomain;
  onClose: () => void;
  onSaved: (domain: ConsoleDomain) => void;
}) {
  const titleId = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const [fromLocalPart, setFromLocalPart] = useState(domain.fromLocalPart || "noreply");
  const [fromName, setFromName] = useState(domain.fromName ?? "");
  const [replyMode, setReplyMode] = useState<"none" | "address">(domain.replyTo ? "address" : "none");
  const [replyTo, setReplyTo] = useState(domain.replyTo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => localRef.current?.focus(), 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  const local = fromLocalPart.trim().toLowerCase() || "noreply";
  const address = `${local}@${domain.name}`;
  const preview = fromName.trim() ? `${fromName.trim()} <${address}>` : address;

  async function save() {
    setError(null);
    if (replyMode === "address" && !replyTo.trim()) {
      setError("Enter the address that should receive replies.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateDomainSender(domain.id, {
        fromLocalPart: local,
        fromName,
        replyMode,
        replyTo,
      });
      onSaved(updated);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not save the sender settings.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">Sender & replies</p>
            <h2 id={titleId} className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">
              {domain.name}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Used when an API call does not set <span className="font-mono">from</span> or{" "}
              <span className="font-mono">reply_to</span>.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
            onClick={onClose}
            disabled={saving}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label htmlFor="sender-local" className={LABEL}>
              Sender address
            </label>
            <div className="flex items-stretch">
              <input
                id="sender-local"
                ref={localRef}
                value={fromLocalPart}
                onChange={(event) => setFromLocalPart(event.target.value)}
                placeholder="noreply"
                autoComplete="off"
                spellCheck={false}
                className={`${FIELD_COMPACT} rounded-r-none font-mono`}
              />
              <span className="inline-flex shrink-0 items-center rounded-r-sm border border-l-0 border-neutral-200 bg-neutral-100 px-3 font-mono text-sm text-neutral-500">
                @{domain.name}
              </span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              noreply is the default. Use hello, billing, support… if you prefer.
            </p>
          </div>

          <div>
            <label htmlFor="sender-name" className={LABEL}>
              Sender name <span className="normal-case tracking-normal text-neutral-400">(optional)</span>
            </label>
            <input
              id="sender-name"
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              placeholder="Acme"
              maxLength={120}
              className={FIELD_COMPACT}
            />
          </div>

          <fieldset>
            <legend className={LABEL}>Replies</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ReplyOption
                checked={replyMode === "none"}
                onSelect={() => setReplyMode("none")}
                title="No replies"
                detail="Replies go to the sender address."
              />
              <ReplyOption
                checked={replyMode === "address"}
                onSelect={() => setReplyMode("address")}
                title="Send replies to…"
                detail="Adds a Reply-To address."
              />
            </div>
            {replyMode === "address" ? (
              <input
                type="email"
                value={replyTo}
                onChange={(event) => setReplyTo(event.target.value)}
                placeholder="support@company.com"
                autoComplete="off"
                spellCheck={false}
                className={`${FIELD_COMPACT} mt-3`}
              />
            ) : null}
          </fieldset>

          <div className="rounded-sm border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Preview</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-neutral-500">From</dt>
                <dd className="min-w-0 truncate font-mono text-neutral-900">{preview}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-neutral-500">Reply-To</dt>
                <dd className="min-w-0 truncate font-mono text-neutral-900">
                  {replyMode === "address" && replyTo.trim() ? replyTo.trim() : "—"}
                </dd>
              </div>
            </dl>
          </div>

          {error ? (
            <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving}>
              <Mail className="size-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReplyOption({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${
        checked
          ? "border-[#0A4BD6] bg-[#0A4BD6]/5"
          : "border-neutral-200 bg-white hover:border-[#0A4BD6]/40"
      }`}
    >
      <span className={`block text-sm font-medium ${checked ? "text-[#0A4BD6]" : "text-neutral-900"}`}>
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-neutral-500">{detail}</span>
    </button>
  );
}

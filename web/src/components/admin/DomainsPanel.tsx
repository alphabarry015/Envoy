import { Check, ChevronRight, Globe, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  type ConsoleDomain,
  DOMAIN_PATTERN,
  createDomain,
  normalizeDomain,
  readStoredDomains,
  writeStoredDomains,
} from "../../lib/domains";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";

export default function DomainsPanel() {
  const titleId = useId();
  const navigate = useNavigate();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [domains, setDomains] = useState<ConsoleDomain[]>(() =>
    readStoredDomains(),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setInput("");
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setInput("");
  }

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen]);

  function addDomain() {
    const name = normalizeDomain(input);
    setError(null);

    if (!DOMAIN_PATTERN.test(name)) {
      setError("Enter a valid domain (e.g. mail.acme.io).");
      return;
    }
    if (domains.some((domain) => domain.name === name)) {
      setError("This domain is already declared in the workspace.");
      return;
    }

    const domain = createDomain(name);
    const next = [domain, ...domains];
    setDomains(next);
    writeStoredDomains(next);
    closeModal();
    navigate(`/console/domains/${domain.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          DNS provider is detected automatically from the domain nameservers.
        </p>
        <button type="button" onClick={openModal} className={BTN_PRIMARY}>
          <Globe className="size-3.5" aria-hidden="true" />
          Add domain
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Workspace domains · {domains.length}
          </p>
        </div>
        <ul className="divide-y divide-neutral-200">
          {domains.length === 0 ? (
            <li className="flex flex-col items-center px-5 py-12 text-center">
              <Globe className="size-8 text-neutral-300" aria-hidden="true" />
              <p className="mt-3 text-sm text-neutral-500">
                No domains yet. Add your first sending identity.
              </p>
            </li>
          ) : (
            domains.map((domain) => (
              <li key={domain.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/console/domains/${domain.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#0A4BD6]/5"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm text-neutral-900">
                      {domain.name}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-neutral-400">
                      DNS · {domain.provider} · DKIM {domain.dkimStatus}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={domain.status} />
                    <ChevronRight
                      className="size-4 text-neutral-400"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
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
                className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      Sending identity
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      Add domain
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      DKIM, SPF and DMARC records are generated after creation.
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

                <div className="space-y-4 px-6 py-5">
                  <div>
                    <label
                      htmlFor="add-domain-name"
                      className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
                    >
                      Domain
                    </label>
                    <input
                      id="add-domain-name"
                      ref={nameInputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addDomain();
                      }}
                      placeholder="mail.example.com"
                      autoComplete="off"
                      spellCheck={false}
                      className={FIELD_COMPACT}
                    />
                  </div>
                  <p className="text-xs text-neutral-500">
                    DNS host (Cloudflare, OVH, Route 53…) is detected from the
                    nameservers. You do not choose it here.
                  </p>
                  {error ? (
                    <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      onClick={addDomain}
                    >
                      <Globe className="size-3.5" aria-hidden="true" />
                      Add domain
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StatusBadge({ status }: { status: ConsoleDomain["status"] }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
        <Check className="size-3" aria-hidden="true" />
        verified
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-neutral-200/70 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
      {status}
    </span>
  );
}

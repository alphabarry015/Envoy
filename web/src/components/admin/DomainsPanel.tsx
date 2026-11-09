import { Check, ChevronDown, ChevronRight, Globe, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  type ConsoleDomain,
  DOMAIN_PATTERN,
  connectRemoteDomain,
  fetchDomains,
  normalizeDomain,
  updateDomainProviders,
} from "../../lib/domains";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import { providerLabel } from "../../lib/providerOptions";
import { type ProviderItem, fetchProviders } from "../../lib/providers";
import { onRealtime, onVisibleRefresh } from "../../lib/realtime";
import { PageLoading } from "../ui/ScanLoading";
import { useToast } from "../ui/Toast";

export default function DomainsPanel() {
  const titleId = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [domains, setDomains] = useState<ConsoleDomain[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadError(null);
    if (opts?.silent) setSyncing(true);
    try {
      const [rows, providers] = await Promise.all([fetchDomains(), fetchProviders()]);
      // Tous les outils connectés (SES, Resend, Brevo, Mailtrap) sont sélectionnables.
      const configured = providers.items.filter(
        (item) => item.connected && item.enabled,
      );
      setDomains(rows);
      setConfiguredProviders(configured);
    } catch (reason: unknown) {
      if (!opts?.silent) {
        setLoadError(reason instanceof Error ? reason.message : "Could not load domains.");
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime pushes Envoy and Resend changes; Brevo / Mailtrap have no domain
  // events, so a visible tab also re-syncs on a slow interval.
  useEffect(() => {
    const refresh = () => void reload({ silent: true });
    const stopRealtime = onRealtime(["domains.changed", "realtime.ready"], refresh);
    const stopVisible = onVisibleRefresh(refresh, 30_000);
    return () => {
      stopRealtime();
      stopVisible();
    };
  }, [reload]);

  function defaultProviderId(items: ProviderItem[]): string {
    // Prefer a DNS-capable tool, but never lock the UI to SES only.
    return (
      items.find((item) => item.id === "ses" && item.domain_capable !== false)?.id ??
      items.find((item) => item.domain_capable !== false)?.id ??
      items[0]?.id ??
      ""
    );
  }

  function toolOptionLabel(provider: ProviderItem): string {
    if (provider.domain_capable === false) {
      return `${provider.label} · Send only (domains unavailable)`;
    }
    return `${provider.label} · DNS verify`;
  }

  function openModal() {
    setInput("");
    setSelectedProvider(defaultProviderId(configuredProviders));
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setInput("");
    setSelectedProvider("");
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

  async function addDomain() {
    const name = normalizeDomain(input);
    setError(null);

    if (!DOMAIN_PATTERN.test(name)) {
      setError("Enter a valid domain (e.g. mail.acme.io).");
      return;
    }
    if (!selectedProvider) {
      setError("Select a sending tool.");
      return;
    }

    const selected = configuredProviders.find((item) => item.id === selectedProvider);
    if (
      selected &&
      (selected.id === "ses" ||
        selected.id === "brevo" ||
        selected.id === "resend" ||
        selected.id === "mailtrap") &&
      selected.domain_capable === false
    ) {
      setError(
        `${providerLabel(selectedProvider)} can send email but cannot manage domains with the current API key.`,
      );
      toast.error(
        `Cannot add with ${providerLabel(selectedProvider)}`,
        "Use a full-access API key, or pick another tool.",
      );
      return;
    }

    const existing = domains.find((domain) => domain.name === name);
    const label = providerLabel(selectedProvider);

    setSaving(true);
    try {
      let domain: ConsoleDomain;
      if (existing) {
        if (existing.sendingProviders.includes(selectedProvider)) {
          setError(`${name} is already linked to ${label}. Open the domain to manage DNS.`);
          return;
        }
        // Same domain, another tool: provision that tool's own DNS on the existing row.
        domain = await updateDomainProviders(existing.id, [
          ...existing.sendingProviders,
          selectedProvider,
        ]);
        toast.success(
          `${label} linked to ${name}`,
          "Publish this tool's DNS records from the domain page.",
        );
      } else {
        domain = await connectRemoteDomain(name, [selectedProvider]);
        toast.success(
          `${name} added`,
          `Connected with ${label} — publish the DNS records shown next.`,
        );
      }
      setDomains((current) => [domain, ...current.filter((item) => item.id !== domain.id)]);
      closeModal();
      navigate(`/console/domains/${domain.id}`, {
        state: { openDnsTool: selectedProvider },
      });
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : "Could not connect the domain.";
      setError(message);
      toast.error(`Could not link ${label}`, message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoading>Loading domains…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Add a domain with SES, Resend, Brevo, or Mailtrap. Each tool keeps its own DNS to publish.
        </p>
        {loadError ? <p className="w-full text-sm text-red-600">{loadError}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BTN_GHOST}
            disabled={syncing}
            onClick={() => void reload({ silent: true })}
            aria-label="Sync domains with sending tools"
          >
            <RefreshCw
              className={`size-3.5 ${syncing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {syncing ? "Syncing…" : "Sync"}
          </button>
          <button type="button" onClick={openModal} className={BTN_PRIMARY}>
            <Globe className="size-3.5" aria-hidden="true" />
            Add domain
          </button>
        </div>
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
                      {domain.sendingProviders
                        .filter((id) => configuredProviders.some((item) => item.id === id))
                        .map((id) => providerLabel(id))
                        .join(" · ") || "No linked tool"}
                      {" · "}DNS {domain.provider}
                      {" · "}DKIM {domain.dkimStatus}
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
                      Choose one sending tool for this new domain.
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
                        if (event.key === "Enter") void addDomain();
                      }}
                      placeholder="mail.example.com"
                      autoComplete="off"
                      spellCheck={false}
                      className={FIELD_COMPACT}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="add-domain-provider"
                      className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
                    >
                      Sending tool
                    </label>
                    {configuredProviders.length === 0 ? (
                      <p className="rounded-sm border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                        No sending tool is configured yet. Connect one in Providers first.
                      </p>
                    ) : (
                      <div className="relative">
                        <select
                          id="add-domain-provider"
                          value={selectedProvider}
                          onChange={(event) => setSelectedProvider(event.target.value)}
                          className={`${FIELD_COMPACT} appearance-none pr-10`}
                        >
                          {configuredProviders.map((provider) => (
                            <option
                              key={provider.id}
                              value={provider.id}
                              disabled={provider.domain_capable === false}
                            >
                              {toolOptionLabel(provider)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-500"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    <p className="mt-2 text-xs text-neutral-500">
                      SES, Resend, Brevo and Mailtrap each return their own DNS to publish.
                      If the domain already exists, this adds the tool without replacing others.
                    </p>
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
                      onClick={() => void addDomain()}
                      disabled={saving || !selectedProvider}
                    >
                      <Globe className="size-3.5" aria-hidden="true" />
                      {saving ? "Connecting…" : "Add domain"}
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

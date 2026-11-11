import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  Globe2,
  KeyRound,
  Link2,
  Mail,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  Trash2,
  Unlink,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  type ConsoleDomain,
  type DnsRecord,
  disconnectRemoteDomain,
  dnsRecordsForTool,
  fetchDomain,
  recheckDomainDns,
  toDnsCsv,
  updateDomainProviders,
  verifyRemoteDomain,
} from "../../lib/domains";
import {
  BTN_GHOST,
  BTN_GHOST_SM,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import { providerLabel } from "../../lib/providerOptions";
import { type ProviderItem, fetchProviders, roleLabel } from "../../lib/providers";
import { onRealtime, onVisibleRefresh } from "../../lib/realtime";
import { PageLoading } from "../ui/ScanLoading";
import DomainSenderModal from "./DomainSenderModal";
import { useToast } from "../ui/Toast";

const STEPS: ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "created", label: "Created", icon: PlusCircle },
  { id: "dns", label: "DNS published", icon: Globe2 },
  { id: "dkim", label: "DKIM check", icon: KeyRound },
  { id: "verified", label: "Verified", icon: BadgeCheck },
];

function formatCreated(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Progress for the currently selected sending tool (not the whole domain). */
function toolStepIndex(
  records: DnsRecord[],
  linked: boolean,
  verifying: boolean,
): number {
  if (!linked) return 0;
  // Linked to this tool.
  if (records.length === 0) return 0;
  const allVerified = records.every((record) => record.status === "verified");
  if (allVerified) return 3;
  if (verifying) return 2;
  const dkim = records.filter((record) => record.purpose === "DKIM");
  const dkimDone =
    dkim.length > 0 && dkim.every((record) => record.status === "verified");
  // DKIM ok but other records still pending → DKIM check step.
  if (dkimDone) return 2;
  // Records exist, waiting for DNS publish.
  return 1;
}

function shortRecordName(name: string, domain: string): string {
  if (name === domain) return "@";
  const suffix = `.${domain}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 3) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export default function DomainDetailPage() {
  const { domainId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const linkTitleId = useId();
  const toast = useToast();
  const [domain, setDomain] = useState<ConsoleDomain | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [toolToLink, setToolToLink] = useState("");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  /** Tool whose DNS is shown below (inline, no modal). */
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [senderOpen, setSenderOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dnsSectionRef = useRef<HTMLElement>(null);

  async function reloadDomain(opts?: { silent?: boolean; openDnsTool?: string | null }) {
    if (!opts?.silent) {
      setLoading(true);
      setMenuOpen(false);
      setCopied(null);
    }
    try {
      const [row, providers] = await Promise.all([
        fetchDomain(domainId),
        fetchProviders(),
      ]);
      if (!row) {
        if (opts?.silent) {
          toast.info(
            "Domain removed",
            "Deleted upstream — this domain is no longer in Envoy.",
          );
          navigate("/console/domains", { replace: true });
          return;
        }
        setDomain(null);
        setConfiguredProviders([]);
        setSelectedToolId(null);
        return;
      }
      setDomain(row);
      setConfiguredProviders(
        providers.items.filter((item) => item.connected && item.enabled),
      );
      setSelectedToolId((current) => {
        if (opts?.openDnsTool && row.sendingProviders.includes(opts.openDnsTool)) {
          return opts.openDnsTool;
        }
        if (current && row.sendingProviders.includes(current)) return current;
        return row.sendingProviders[0] ?? null;
      });
    } catch {
      if (!opts?.silent) {
        setDomain(null);
        setConfiguredProviders([]);
        setSelectedToolId(null);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    const openDnsTool =
      typeof (location.state as { openDnsTool?: string } | null)?.openDnsTool === "string"
        ? ((location.state as { openDnsTool?: string }).openDnsTool ?? null)
        : null;
    void reloadDomain({ openDnsTool });
    // Intentionally ignore location.state after first load for this domainId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  // Realtime: remote/tool sync and mutations arrive over WebSocket.
  useEffect(() => {
    const stopRealtime = onRealtime(["domains.changed", "realtime.ready"], (message) => {
      const data = message.data || {};
      if (
        typeof data.domain_id === "string" &&
        data.domain_id.length > 0 &&
        data.domain_id !== domainId
      ) {
        return;
      }
      void reloadDomain({ silent: true });
    });
    const stopVisible = onVisibleRefresh(() => {
      void recheckDomainDns(domainId)
        .catch(() => undefined)
        .finally(() => void reloadDomain({ silent: true }));
    }, 30_000);
    return () => {
      stopRealtime();
      stopVisible();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!linkModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (linking) return;
      setLinkModalOpen(false);
      setLinkError(null);
      setToolToLink("");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [linkModalOpen, linking]);

  const registeredTools = (() => {
    if (!domain) return [] as ProviderItem[];
    const byId = new Map(configuredProviders.map((item) => [item.id, item]));
    // Affiche tous les outils liés (1, 2 ou 3…), configurés en priorité.
    return domain.sendingProviders.map((id) => {
      const configured = byId.get(id);
      if (configured) return configured;
      return {
        id,
        label: providerLabel(id),
        enabled: false,
        connected: false,
        domain_capable: false,
        role: "linked",
        sort_order: 999,
        daily_limit: null,
        monthly_limit: null,
        usage: { sent_today: 0, sent_month: 0, failovers_today: 0 },
        domains: { connected: 0, offered: 0, offered_known: false },
        testing: false,
      } satisfies ProviderItem;
    });
  })();
  const linkableProviders = configuredProviders.filter(
    (item) => item.domain_capable !== false,
  );
  const availableToLink = linkableProviders.filter(
    (item) => !domain?.sendingProviders.includes(item.id),
  );
  const alreadyLinkedToSelect = linkableProviders.filter((item) =>
    domain?.sendingProviders.includes(item.id),
  );
  const linkModalOptions = [...availableToLink, ...alreadyLinkedToSelect];
  const blockedToLink = configuredProviders.filter(
    (item) => item.domain_capable === false,
  );
  const selectedToolRecords =
    domain && selectedToolId
      ? dnsRecordsForTool(domain.dnsRecords, selectedToolId)
      : [];
  const dnsVerifiedCount = selectedToolRecords.filter(
    (record) => record.status === "verified",
  ).length;
  const dnsPendingCount = selectedToolRecords.filter(
    (record) => record.status !== "verified",
  ).length;

  if (loading) {
    return (
      <PageLoading>Loading domain…</PageLoading>
    );
  }

  if (!domain) {
    return <Navigate to="/console/domains" replace />;
  }

  const current = domain;
  const selectedLinked = Boolean(
    selectedToolId && current.sendingProviders.includes(selectedToolId),
  );
  const activeStep = toolStepIndex(selectedToolRecords, selectedLinked, verifying);

  async function verifyDomain() {
    if (verifying) return;
    const canVerify =
      current.sendingProviders.includes("ses") ||
      current.sendingProviders.includes("brevo") ||
      current.sendingProviders.includes("resend") ||
      current.sendingProviders.includes("mailtrap");
    if (!canVerify) return;
    setVerifying(true);
    try {
      const updated = await verifyRemoteDomain(current.id);
      setDomain(updated);
      showToolWarnings(updated);
      const toolId = selectedToolId;
      const toolRecords = toolId
        ? dnsRecordsForTool(updated.dnsRecords, toolId)
        : updated.dnsRecords;
      const pending = toolRecords.filter((record) => record.status !== "verified").length;
      const label = toolId ? providerLabel(toolId) : "Domain";
      if (pending > 0) {
        toast.warning(
          `${label} DNS check`,
          `${pending} record${pending === 1 ? "" : "s"} still not published — copy them below.`,
        );
      } else if (toolRecords.length === 0) {
        toast.error(
          `${label} has no DNS`,
          "Unlink this tool, then link again.",
        );
      } else {
        toast.success(`${label} verified`, "All records for this tool are published.");
      }
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : "Could not verify the domain.";
      if (/no longer exists|not found|removed from envoy/i.test(message)) {
        toast.warning(
          "Domain removed",
          "This domain was deleted on the sending tool and removed from Envoy.",
        );
        navigate("/console/domains", { replace: true });
        return;
      }
      toast.error("DNS check failed", message);
    } finally {
      setVerifying(false);
    }
  }

  async function removeDomain() {
    await disconnectRemoteDomain(current.id);
    navigate("/console/domains", { replace: true });
  }

  function openLinkModal() {
    setLinkError(null);
    setToolToLink(linkModalOptions[0]?.id ?? "");
    setLinkModalOpen(true);
  }

  function closeLinkModal() {
    if (linking) return;
    setLinkModalOpen(false);
    setLinkError(null);
    setToolToLink("");
  }

  function showToolWarnings(updated: ConsoleDomain) {
    for (const warning of updated.toolWarnings ?? []) {
      toast.error("Tool misconfigured", warning);
    }
  }

  function finishLinkSuccess(
    updated: ConsoleDomain,
    linkedTool: string,
    label: string,
    alreadyLinked = false,
  ) {
    setDomain(updated);
    setToolToLink("");
    setLinkModalOpen(false);
    showToolWarnings(updated);
    const toolRecords = dnsRecordsForTool(updated.dnsRecords, linkedTool);
    const pending = toolRecords.filter((record) => record.status !== "verified").length;

    setSelectedToolId(linkedTool);
    window.setTimeout(() => {
      dnsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    if (toolRecords.length === 0) {
      toast.error(
        `${label} has no DNS to publish`,
        "The tool did not return records. It is not properly connected for this domain.",
      );
      return;
    }

    if (alreadyLinked) {
      toast.success(
        `${label} already linked`,
        pending > 0
          ? `${pending} DNS record${pending === 1 ? "" : "s"} still to publish — copy them below.`
          : "DNS refreshed for this tool.",
      );
      return;
    }
    if (pending > 0) {
      toast.warning(
        `${label} linked`,
        `${pending} DNS record${pending === 1 ? "" : "s"} to publish at your DNS host — copy them below.`,
      );
      return;
    }
    toast.success(`${label} linked`, "Tool connected and DNS look published.");
  }

  function selectTool(toolId: string) {
    setSelectedToolId(toolId);
    window.setTimeout(() => {
      dnsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function linkTool() {
    if (!toolToLink || linking) return;
    const label = providerLabel(toolToLink);
    const linkedTool = toolToLink;
    setLinking(true);
    setLinkError(null);
    try {
      // Already linked: refresh that tool's DNS and select it inline.
      if (current.sendingProviders.includes(linkedTool)) {
        const updated = await updateDomainProviders(current.id, current.sendingProviders);
        finishLinkSuccess(updated, linkedTool, label, true);
        return;
      }
      const next = [...new Set([...current.sendingProviders, linkedTool])];
      const updated = await updateDomainProviders(current.id, next);
      finishLinkSuccess(updated, linkedTool, label, false);
    } catch (reason: unknown) {
      // Fail-closed: tool is NOT added to Sending tools.
      const message =
        reason instanceof Error ? reason.message : "Could not link the tool.";
      setLinkError(message);
      toast.error(`Could not link ${label}`, message);
    } finally {
      setLinking(false);
    }
  }

  async function unlinkTool(toolId: string) {
    if (unlinkingId || current.sendingProviders.length <= 1) return;
    const label = providerLabel(toolId);
    setUnlinkingId(toolId);
    setLinkError(null);
    try {
      const next = current.sendingProviders.filter((id) => id !== toolId);
      const updated = await updateDomainProviders(current.id, next);
      setDomain(updated);
      if (selectedToolId === toolId) {
        setSelectedToolId(updated.sendingProviders[0] ?? null);
      }
      toast.success(`${label} unlinked`, "Tool removed from this domain.");
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : "Could not unlink the tool.";
      toast.error(`Could not unlink ${label}`, message);
    } finally {
      setUnlinkingId(null);
    }
  }

  async function copyField(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function copyDomainCsv() {
    await navigator.clipboard.writeText(toDnsCsv(current));
    setCopied("__domain__");
    setMenuOpen(false);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="space-y-6">
      <Link
        to="/console/domains"
        className="inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-[#0A4BD6]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to domains
      </Link>

      {senderOpen ? (
        <DomainSenderModal
          domain={domain}
          onClose={() => setSenderOpen(false)}
          onSaved={(updated) => {
            setDomain((current) => (current ? { ...current, ...updated } : updated));
            setSenderOpen(false);
            toast.success("Sender saved", `Default sender: ${updated.mailFrom}`);
          }}
        />
      ) : null}
      {/* Section 1 — identity + actions + meta */}
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Sending identity
            </p>
            <h2 className="mt-1 truncate font-mono text-xl font-semibold tracking-tight text-neutral-950 md:text-2xl">
              {domain.name}
            </h2>
            <p className="mt-2 font-mono text-xs text-neutral-500">
              {domain.fromName ? `${domain.fromName} <${domain.mailFrom}>` : domain.mailFrom}
              {domain.replyTo ? ` · replies → ${domain.replyTo}` : " · no replies"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {domain.status === "verified" ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <Check className="size-3.5" aria-hidden="true" />
                Verified
              </span>
            ) : null}

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={
                  domain.senderConfigured ? "Domain actions" : "Domain actions (sender not configured)"
                }
                className="relative inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-600 transition-colors hover:border-[#0A4BD6]/40 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical className="size-4" aria-hidden="true" />
                {domain.senderConfigured ? null : (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 flex size-2.5"
                  >
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full border border-white bg-orange-500" />
                  </span>
                )}
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1.5 min-w-[190px] overflow-hidden rounded-sm border border-neutral-200 bg-white py-1 shadow-sm"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={() => {
                      setMenuOpen(false);
                      setSenderOpen(true);
                    }}
                  >
                    <Mail className="size-3.5" aria-hidden="true" />
                    Sender & replies
                    {domain.senderConfigured ? null : (
                      <span className="ml-auto size-2 rounded-full bg-orange-500" aria-label="Not configured" />
                    )}
                  </button>
                  {linkModalOptions.length > 0 || blockedToLink.length > 0 ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                      onClick={() => {
                        setMenuOpen(false);
                        openLinkModal();
                      }}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Link tool
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={() => void copyDomainCsv()}
                  >
                    {copied === "__domain__" ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                    {copied === "__domain__" ? "Copied CSV" : "Copy domain"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    onClick={removeDomain}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-neutral-200 pt-5 text-center sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem label="Created" value={formatCreated(domain.createdAt)} />
          <MetaItem
            label="Status"
            value={
              <span
                className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${
                  domain.status === "verified"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-neutral-200/70 text-neutral-600"
                }`}
              >
                {domain.status}
              </span>
            }
          />
          <MetaItem label="DNS host" value={domain.provider} />
          <MetaItem label="Region" value={domain.region} />
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Sending tools
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Select a tool to show its DNS records below. Each tool keeps its own records.
            </p>
          </div>

          {registeredTools.length === 0 ? (
            <p className="mt-4 rounded-sm border border-dashed border-neutral-200 bg-white px-4 py-5 text-sm text-neutral-500">
              No tool is linked to this domain yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-3">
              {registeredTools.map((tool) => {
                const toolDns = dnsRecordsForTool(domain.dnsRecords, tool.id);
                const pendingDns = toolDns.filter((r) => r.status !== "verified").length;
                const selected = selectedToolId === tool.id;
                return (
                  <li
                    key={tool.id}
                    className={`flex min-w-[12rem] flex-1 basis-[12rem] items-center justify-between gap-3 rounded-sm border bg-white px-4 py-3 sm:max-w-[18rem] sm:flex-none ${
                      selected
                        ? "border-[#0A4BD6] ring-1 ring-[#0A4BD6]/40"
                        : "border-neutral-200"
                    }`}
                  >
                    <button
                      type="button"
                      className={`min-w-0 flex-1 text-left transition-colors ${
                        selected ? "text-[#0A4BD6]" : "hover:text-[#0A4BD6]"
                      }`}
                      onClick={() => selectTool(tool.id)}
                      aria-pressed={selected}
                      title={`Show ${tool.label} DNS`}
                    >
                      <span className="block truncate text-sm font-medium text-neutral-950">
                        {tool.label}
                      </span>
                      <span
                        className={`mt-1 block truncate font-mono text-[11px] ${
                          selected ? "text-[#0A4BD6]/80" : "text-neutral-400"
                        }`}
                      >
                        {tool.connected ? roleLabel(tool.role) : "Linked"}
                        {tool.testing ? " · Testing" : ""}
                        {toolDns.length > 0
                          ? pendingDns > 0
                            ? ` · ${pendingDns} DNS pending`
                            : " · DNS OK"
                          : " · No DNS"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-neutral-200 px-2 py-1.5 font-mono text-[11px] text-neutral-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={
                        registeredTools.length <= 1 || unlinkingId === tool.id
                      }
                      title={
                        registeredTools.length <= 1
                          ? "Keep at least one tool, or disconnect the domain"
                          : `Unlink ${tool.label}`
                      }
                      onClick={() => void unlinkTool(tool.id)}
                    >
                      <Unlink className="size-3.5" aria-hidden="true" />
                      {unlinkingId === tool.id ? "…" : "Unlink"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

        </div>
      </section>

      {linkModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeLinkModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={linkTitleId}
                className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      Domain tools
                    </p>
                    <h2
                      id={linkTitleId}
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      Link tool
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Add another tool, or refresh DNS for one already linked.
                      Each tool keeps its own DNS records.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={closeLinkModal}
                    disabled={linking}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-4 px-6 py-5">
                  <div>
                    <label
                      htmlFor="link-domain-tool"
                      className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
                    >
                      Sending tool
                    </label>
                    {linkModalOptions.length === 0 ? (
                      <p className="rounded-sm border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                        {blockedToLink.length > 0
                          ? "No tool is ready to link. Fix domain API access first."
                          : "No configured tool is available to link."}
                      </p>
                    ) : (
                      <div className="relative">
                        <select
                          id="link-domain-tool"
                          value={toolToLink}
                          onChange={(event) => setToolToLink(event.target.value)}
                          className={`${FIELD_COMPACT} appearance-none pr-10`}
                        >
                          {linkModalOptions.map((tool) => {
                            const already = current.sendingProviders.includes(tool.id);
                            return (
                              <option key={tool.id} value={tool.id}>
                                {tool.label}
                                {already
                                  ? " · Already linked · refresh DNS"
                                  : " · DNS verify"}
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-500"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    {blockedToLink.length > 0 ? (
                      <p className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {blockedToLink.map((tool) => tool.label).join(", ")}{" "}
                        {blockedToLink.length === 1 ? "is" : "are"} connected for
                        sending only — domain management is unavailable with the
                        current API key.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-neutral-500">
                        Linking a new tool provisions its DNS without replacing other
                        tools. Already-linked tools reopen their DNS sheet.
                      </p>
                    )}
                  </div>
                  {linkError ? (
                    <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {linkError}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={closeLinkModal}
                      disabled={linking}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      disabled={!toolToLink || linking || linkModalOptions.length === 0}
                      onClick={() => void linkTool()}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      {linking
                        ? "Checking DNS…"
                        : current.sendingProviders.includes(toolToLink)
                          ? "Refresh DNS"
                          : "Link & verify"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Section 2 — verification steps for the selected sending tool */}
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="mb-5">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Verification status
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {selectedToolId
              ? `Progress for ${providerLabel(selectedToolId)}. Select another tool above to switch.`
              : "Select a sending tool above to see its verification progress."}
          </p>
        </div>
        <ol className="flex w-full flex-col items-stretch gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
          {STEPS.map((step, index) => {
            const done = index < activeStep;
            const currentStep = index === activeStep;
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                className="relative flex flex-1 flex-col items-center text-center"
              >
                {index < STEPS.length - 1 ? (
                  <span
                    className={`absolute top-4 left-[calc(50%+1.125rem)] hidden h-px w-[calc(100%-2.25rem)] sm:block ${
                      done ? "bg-[#0A4BD6]" : "bg-neutral-200"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`relative z-10 flex size-8 items-center justify-center rounded-sm border ${
                    done || currentStep
                      ? "border-[#0A4BD6] bg-[#0A4BD6] text-white"
                      : "border-neutral-200 bg-white text-neutral-400"
                  }`}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Icon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={`mt-2 text-sm ${
                    currentStep
                      ? "font-medium text-[#0A4BD6]"
                      : done
                        ? "text-neutral-800"
                        : "text-neutral-400"
                  }`}
                >
                  {step.label}
                </span>
                {currentStep && verifying ? (
                  <span className="mt-1 font-mono text-[11px] text-[#0A4BD6]">
                    In progress…
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Section 3 — DNS records for the selected tool */}
      <section
        ref={dnsSectionRef}
        className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6"
      >
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              DNS records
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {selectedToolId
                ? `Showing ${providerLabel(selectedToolId)} records. Publish pending ones, then re-check DNS.`
                : "Select a sending tool above to view its DNS records."}
            </p>
            {selectedToolId ? (
              <p className="mt-2 font-mono text-[11px] text-neutral-400">
                {providerLabel(selectedToolId)} · {dnsVerifiedCount} configured ·{" "}
                {dnsPendingCount} not configured
              </p>
            ) : null}
          </div>
          {domain.sendingProviders.includes("ses") ||
          domain.sendingProviders.includes("brevo") ||
          domain.sendingProviders.includes("resend") ||
          domain.sendingProviders.includes("mailtrap") ? (
            <button
              type="button"
              className={`${BTN_GHOST_SM} shrink-0`}
              onClick={() => void verifyDomain()}
              disabled={verifying}
            >
              <RefreshCw
                className={`size-3.5 ${verifying ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {verifying ? "Checking DNS…" : "Re-check DNS"}
            </button>
          ) : null}
        </div>

        {!selectedToolId ? (
          <p className="rounded-sm border border-dashed border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
            No tool selected.
          </p>
        ) : selectedToolRecords.length === 0 ? (
          <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
            <p className="font-medium">Misconfigured tool</p>
            <p className="mt-1 text-red-600/90">
              {providerLabel(selectedToolId)} did not return DNS records for{" "}
              {domain.name}. Unlink this tool, then link again.
            </p>
          </div>
        ) : (
          <DnsRecordsTable
            domainName={domain.name}
            records={selectedToolRecords}
            copied={copied}
            onCopy={copyField}
            showPurpose
          />
        )}
      </section>
    </div>
  );
}

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
        {label}
      </p>
      <div className="mt-1.5 flex justify-center text-sm text-neutral-800">
        {value}
      </div>
    </div>
  );
}

function CopyFieldButton({
  copyKey,
  value,
  copied,
  onCopy,
  label,
}: {
  copyKey: string;
  value: string;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  label: string;
}) {
  const isCopied = copied === copyKey;
  return (
    <button
      type="button"
      aria-label={isCopied ? `${label} copied` : `Copy ${label}`}
      title={isCopied ? "Copied" : `Copy ${label}`}
      onClick={() => void onCopy(copyKey, value)}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-all hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6] ${
        isCopied
          ? "opacity-100"
          : "opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
      }`}
    >
      {isCopied ? (
        <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

function DnsRecordsTable({
  domainName,
  records,
  copied,
  onCopy,
  showPurpose = false,
}: {
  domainName: string;
  records: DnsRecord[];
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  showPurpose?: boolean;
}) {
  if (records.length === 0) {
    return (
      <p className="rounded-sm border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
        No DNS records for this tool.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-neutral-200 bg-white">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          {showPurpose ? <col className="w-[12%]" /> : null}
          <col className={showPurpose ? "w-[20%]" : "w-[22%]"} />
          <col className="w-[10%]" />
          <col className={showPurpose ? "w-[36%]" : "w-[42%]"} />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            {showPurpose ? <th className="px-4 py-2.5 font-medium">Purpose</th> : null}
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Content</th>
            <th className="px-4 py-2.5 font-medium">TTL</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const rowKey = `${record.source || "x"}-${record.type}-${record.purpose}-${record.name}`;
            const nameValue = shortRecordName(record.name, domainName);
            const ttlValue = String(record.ttl || 300);
            const contentValue =
              record.type === "MX" && record.priority != null
                ? `${record.priority} ${record.value}`
                : record.value;
            return (
              <tr
                key={rowKey}
                className="border-b border-neutral-100 last:border-0"
              >
                {showPurpose ? (
                  <td className="px-4 py-3 font-mono text-[11px] tracking-wide text-neutral-500 uppercase">
                    {record.purpose || "—"}
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="group/cell flex min-w-0 items-center gap-1.5 font-mono text-xs text-neutral-900">
                    <span className="truncate">{nameValue}</span>
                    <CopyFieldButton
                      copyKey={`${rowKey}:name`}
                      value={nameValue}
                      copied={copied}
                      onCopy={onCopy}
                      label="name"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="group/cell flex min-w-0 items-center gap-1.5">
                    <span className="rounded-sm bg-[#0A4BD6]/10 px-2 py-0.5 font-mono text-[11px] text-[#0A4BD6]">
                      {record.type}
                    </span>
                    <CopyFieldButton
                      copyKey={`${rowKey}:type`}
                      value={record.type}
                      copied={copied}
                      onCopy={onCopy}
                      label="type"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="group/cell flex min-w-0 items-center gap-1.5">
                    <span
                      className="truncate font-mono text-xs text-neutral-500"
                      title={contentValue}
                    >
                      {truncateMiddle(contentValue)}
                    </span>
                    <CopyFieldButton
                      copyKey={`${rowKey}:content`}
                      value={contentValue}
                      copied={copied}
                      onCopy={onCopy}
                      label="content"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="group/cell flex min-w-0 items-center gap-1.5 font-mono text-xs text-neutral-500">
                    <span>{ttlValue}</span>
                    <CopyFieldButton
                      copyKey={`${rowKey}:ttl`}
                      value={ttlValue}
                      copied={copied}
                      onCopy={onCopy}
                      label="TTL"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {record.status === "verified" ? (
                    <span className="inline-flex rounded-sm bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                      Configured
                    </span>
                  ) : (
                    <span className="inline-flex rounded-sm bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-700">
                      Not configured
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Copy,
  Globe2,
  KeyRound,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import {
  type ConsoleDomain,
  type DnsRecord,
  getStoredDomain,
  markDomainVerified,
  removeStoredDomain,
  toDnsCsv,
  updateStoredDomain,
} from "../../lib/domains";
import { BTN_GHOST_SM } from "../../lib/consoleUi";
import { ScanLoadingButton } from "../ui/ScanLoading";

const BTN_GHOST = BTN_GHOST_SM;

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

function stepIndex(domain: ConsoleDomain, verifying: boolean): number {
  if (domain.status === "verified") return 3;
  if (verifying) return 2;
  if (domain.dkimStatus === "PENDING" || domain.status === "pending") return 1;
  return 0;
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
  const [domain, setDomain] = useState<ConsoleDomain | null>(() =>
    getStoredDomain(domainId),
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendingEnabled, setSendingEnabled] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDomain(getStoredDomain(domainId));
    setMenuOpen(false);
    setCopied(null);
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

  if (!domain) {
    return <Navigate to="/console/domains" replace />;
  }

  const current = domain;
  const activeStep = stepIndex(current, verifying);

  function verifyDomain() {
    if (verifying || current.status === "verified") return;
    setVerifying(true);
    window.setTimeout(() => {
      const updated = updateStoredDomain(current.id, markDomainVerified);
      if (updated) setDomain(updated);
      setVerifying(false);
    }, 1800);
  }

  function removeDomain() {
    removeStoredDomain(current.id);
    navigate("/console/domains", { replace: true });
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {domain.status === "verified" ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <Check className="size-3.5" aria-hidden="true" />
                Verified
              </span>
            ) : (
              <ScanLoadingButton
                loading={verifying}
                loadingLabel={
                  <>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Verifying…
                  </>
                }
                idleClassName={BTN_GHOST}
                onClick={verifyDomain}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Verify DKIM
              </ScanLoadingButton>
            )}

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Domain actions"
                className="inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-600 transition-colors hover:border-[#0A4BD6]/40 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical className="size-4" aria-hidden="true" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1.5 min-w-[160px] overflow-hidden rounded-sm border border-neutral-200 bg-white py-1 shadow-sm"
                >
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
          <MetaItem label="DNS provider" value={domain.provider} />
          <MetaItem label="Region" value={domain.region} />
        </div>
      </section>

      {/* Section 2 — horizontal verification steps */}
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <p className="mb-5 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          Verification status
        </p>
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

      {/* Section 3 — DNS records (grouped like Resend) */}
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            DNS records
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Publish these records at your DNS host, then run Verify DKIM.
          </p>
        </div>

        <div className="space-y-8">
          <DnsGroup title="Domain Verification">
            <DnsPurposeHeading label="DKIM" href="/docs" />
            <DnsRecordsTable
              domainName={domain.name}
              records={domain.dnsRecords.filter((r) => r.purpose === "DKIM")}
              copied={copied}
              onCopy={copyField}
            />
          </DnsGroup>

          <DnsGroup
            title="Enable Sending"
            action={
              <ToggleSwitch
                checked={sendingEnabled}
                onChange={setSendingEnabled}
                label="Enable sending"
              />
            }
          >
            {sendingEnabled ? (
              <div className="space-y-6">
                <div>
                  <DnsPurposeHeading label="SPF" href="/docs" />
                  <DnsRecordsTable
                    domainName={domain.name}
                    records={domain.dnsRecords.filter((r) => r.purpose === "SPF")}
                    copied={copied}
                    onCopy={copyField}
                  />
                </div>
                <div>
                  <DnsPurposeHeading
                    label="DMARC"
                    hint="Optional"
                    href="/docs"
                  />
                  <DnsRecordsTable
                    domainName={domain.name}
                    records={domain.dnsRecords.filter(
                      (r) => r.purpose === "DMARC",
                    )}
                    copied={copied}
                    onCopy={copyField}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Turn on sending to show SPF and DMARC records.
              </p>
            )}
          </DnsGroup>
        </div>
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

function DnsGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium text-neutral-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DnsPurposeHeading({
  label,
  hint,
  href,
}: {
  label: string;
  hint?: string;
  href: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <Link
        to={href}
        className="inline-flex items-center gap-1 text-sm font-medium text-neutral-800 transition-colors hover:text-[#0A4BD6]"
      >
        {label}
        <ArrowUpRight className="size-3.5 text-neutral-400" aria-hidden="true" />
      </Link>
      {hint ? (
        <span className="text-sm text-neutral-400">({hint})</span>
      ) : null}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-[#0A4BD6]" : "bg-neutral-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
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
}: {
  domainName: string;
  records: DnsRecord[];
  copied: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  if (records.length === 0) {
    return (
      <p className="rounded-sm border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
        No records in this group.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-neutral-200 bg-white">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[12%]" />
          <col className="w-[42%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Content</th>
            <th className="px-4 py-2.5 font-medium">TTL</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const rowKey = `${record.purpose}-${record.name}`;
            const nameValue = shortRecordName(record.name, domainName);
            const ttlValue = String(record.ttl || 300);
            return (
              <tr
                key={rowKey}
                className="border-b border-neutral-100 last:border-0"
              >
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
                      title={record.value}
                    >
                      {truncateMiddle(record.value)}
                    </span>
                    <CopyFieldButton
                      copyKey={`${rowKey}:content`}
                      value={record.value}
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
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex rounded-sm bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-500">
                      Pending
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

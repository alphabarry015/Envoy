import { ArrowLeft, Cable } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { BTN_GHOST, BTN_PRIMARY, FIELD_COMPACT } from "../../lib/consoleUi";
import { formatSentAgo } from "../../lib/emails";
import {
  type ProviderDetail,
  type ProviderStatusCounts,
  type ProviderWebhookLink,
  domainStatsLabel,
  ensureProviderWebhook,
  fetchProvider,
  roleLabel,
  updateProviders,
  usageRatio,
} from "../../lib/providers";
import { useConsoleAccount } from "./consoleAccount";
import { PageLoading } from "../ui/ScanLoading";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function limitLabel(value: number | null | undefined): string {
  return value == null ? "Unlimited" : formatCount(value);
}

function remainingLabel(value: number | null | undefined, limit: number | null): string {
  if (limit == null) return "No cap";
  return `${formatCount(value ?? 0)} left`;
}

const STATUS_ROWS: Array<{ key: keyof ProviderStatusCounts; label: string }> = [
  { key: "delivered", label: "Delivered" },
  { key: "sent", label: "Sent" },
  { key: "queued", label: "Queued" },
  { key: "bounced", label: "Bounced" },
  { key: "complained", label: "Complained" },
  { key: "failed", label: "Failed" },
  { key: "suppressed", label: "Suppressed" },
];

export default function ProviderDetailPage() {
  const { providerId = "" } = useParams();
  const account = useConsoleAccount();
  const isAdmin = account.isAdmin;
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);
  const [webhookNote, setWebhookNote] = useState<string | null>(null);
  const [dailyInput, setDailyInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchProvider(providerId)
      .then((row) => {
        if (cancelled) return;
        setProvider(row);
        setDailyInput(row.daily_limit != null ? String(row.daily_limit) : "");
        setMonthlyInput(row.monthly_limit != null ? String(row.monthly_limit) : "");
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setProvider(null);
          setError(cause instanceof Error ? cause.message : "Could not load provider.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  async function reload() {
    const row = await fetchProvider(providerId);
    setProvider(row);
    setDailyInput(row.daily_limit != null ? String(row.daily_limit) : "");
    setMonthlyInput(row.monthly_limit != null ? String(row.monthly_limit) : "");
  }

  async function toggleEnabled() {
    if (!provider || !isAdmin || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProviders([{ id: provider.id, enabled: !provider.enabled }]);
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not update provider.");
    } finally {
      setSaving(false);
    }
  }

  async function syncWebhook() {
    if (!provider || !isAdmin || syncingWebhook) return;
    setSyncingWebhook(true);
    setError(null);
    setWebhookNote(null);
    try {
      const link = await ensureProviderWebhook(provider.id);
      await reload();
      setWebhookNote(webhookResultNote(link));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not sync webhook.");
    } finally {
      setSyncingWebhook(false);
    }
  }

  async function saveLimits() {
    if (!provider || !isAdmin || saving) return;
    const dailyRaw = dailyInput.trim();
    const monthlyRaw = monthlyInput.trim();
    const daily = dailyRaw ? Number(dailyRaw) : null;
    const monthly = monthlyRaw ? Number(monthlyRaw) : null;
    if ((dailyRaw && (!Number.isFinite(daily) || (daily as number) < 1)) ||
      (monthlyRaw && (!Number.isFinite(monthly) || (monthly as number) < 1))) {
      setError("Limits must be empty (unlimited) or an integer ≥ 1.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProviders([
        {
          id: provider.id,
          daily_limit: daily,
          monthly_limit: monthly,
          clear_daily_limit: daily == null,
          clear_monthly_limit: monthly == null,
        },
      ]);
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not save limits.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoading>Loading provider…</PageLoading>;
  }

  if (!provider) {
    if (error) {
      return (
        <div className="space-y-4">
          <Link
            to="/console/providers"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-[#0A4BD6]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to providers
          </Link>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      );
    }
    return <Navigate to="/console/providers" replace />;
  }

  const dayRatio = usageRatio(provider.usage.sent_today, provider.daily_limit);
  const monthRatio = usageRatio(provider.usage.sent_month, provider.monthly_limit);

  return (
    <div className="space-y-6">
      <Link
        to="/console/providers"
        className="inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-[#0A4BD6]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to providers
      </Link>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Sending tool
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Cable className="size-5 text-neutral-400" aria-hidden="true" />
              <h2 className="truncate text-xl font-semibold tracking-tight text-neutral-950 md:text-2xl">
                {provider.label}
              </h2>
              <span className="rounded-sm bg-neutral-100 px-2 py-0.5 font-mono text-[10px] tracking-wide text-neutral-600 uppercase">
                {roleLabel(provider.role)}
              </span>
              {provider.testing ? (
                <span className="rounded-sm bg-amber-50 px-2 py-0.5 font-mono text-[10px] tracking-wide text-amber-700 uppercase">
                  Testing
                </span>
              ) : null}
              {!provider.connected ? (
                <span className="rounded-sm bg-orange-50 px-2 py-0.5 font-mono text-[10px] tracking-wide text-orange-700 uppercase">
                  Missing key
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-xs text-neutral-500">
              Policy {provider.policy} · chain {provider.effective_order.join(" → ") || "none"}
            </p>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className={provider.enabled ? BTN_GHOST : BTN_PRIMARY}
              disabled={saving}
              onClick={() => void toggleEnabled()}
            >
              {provider.enabled ? "Disable" : "Enable"}
            </button>
          ) : null}
        </div>
      </section>

      {provider.connection ? (
        <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Live connection
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-neutral-950">API key</p>
              <p className="mt-1 text-sm text-neutral-600">
                {provider.connection.api_ok ? "Reachable" : "Not reachable"}
                {provider.connection.api_detail ? ` · ${provider.connection.api_detail}` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-950">Inbound webhook</p>
              <p className="mt-1 break-all font-mono text-xs text-neutral-600">
                {provider.connection.webhook?.expected_url || "—"}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {provider.connection.webhook?.linked
                  ? `Linked${provider.connection.webhook.active === false ? " (inactive)" : ""}`
                  : "Not linked on the tool"}
                {provider.connection.webhook?.secret_configured ? " · secret set" : " · secret missing"}
              </p>
              {provider.connection.webhook?.detail ? (
                <p className="mt-1 text-xs text-neutral-500">{provider.connection.webhook.detail}</p>
              ) : null}
            </div>
          </div>
          {webhookNote ? <p className="mt-3 text-sm text-emerald-700">{webhookNote}</p> : null}
          {isAdmin && provider.id !== "ses" ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={syncingWebhook}
                onClick={() => void syncWebhook()}
              >
                {syncingWebhook ? "Syncing…" : "Ensure webhook on tool"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Domains"
          value={
            provider.domains?.offered_known
              ? `${formatCount(provider.domains.connected)} / ${formatCount(provider.domains.offered)}`
              : formatCount(provider.domains?.connected ?? 0)
          }
          hint={
            provider.domains?.offered_known
              ? "connected / on tool"
              : domainStatsLabel(provider.domains)
          }
        />
        <StatCard
          label="Sent today"
          value={formatCount(provider.usage.sent_today)}
          hint={
            provider.daily_limit != null
              ? `/ ${formatCount(provider.daily_limit)} limit`
              : "no daily limit"
          }
        />
        <StatCard
          label="Remaining today"
          value={
            provider.daily_limit == null
              ? "∞"
              : formatCount(provider.remaining_today ?? 0)
          }
          hint={remainingLabel(provider.remaining_today, provider.daily_limit)}
        />
        <StatCard
          label="Sent this month"
          value={formatCount(provider.usage.sent_month)}
          hint={
            provider.monthly_limit != null
              ? `/ ${formatCount(provider.monthly_limit)} limit`
              : "no monthly limit"
          }
        />
        <StatCard
          label="Remaining month"
          value={
            provider.monthly_limit == null
              ? "∞"
              : formatCount(provider.remaining_month ?? 0)
          }
          hint={remainingLabel(provider.remaining_month, provider.monthly_limit)}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <UsageBar
          title="Daily consumption"
          used={provider.usage.sent_today}
          limit={provider.daily_limit}
          ratio={dayRatio}
        />
        <UsageBar
          title="Monthly consumption"
          used={provider.usage.sent_month}
          limit={provider.monthly_limit}
          ratio={monthRatio}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <StatusTable title="Status today" counts={provider.status_today} />
        <StatusTable title="Status this month" counts={provider.status_month} />
      </section>

      {isAdmin ? (
        <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Soft limits
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Caps used for routing awareness. Leave blank for unlimited. Current: daily{" "}
            {limitLabel(provider.daily_limit)}, monthly {limitLabel(provider.monthly_limit)}.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="provider-daily-limit"
                className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
              >
                Daily limit
              </label>
              <input
                id="provider-daily-limit"
                inputMode="numeric"
                value={dailyInput}
                onChange={(event) => setDailyInput(event.target.value)}
                placeholder="Unlimited"
                className={FIELD_COMPACT}
              />
            </div>
            <div>
              <label
                htmlFor="provider-monthly-limit"
                className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
              >
                Monthly limit
              </label>
              <input
                id="provider-monthly-limit"
                inputMode="numeric"
                value={monthlyInput}
                onChange={(event) => setMonthlyInput(event.target.value)}
                placeholder="Unlimited"
                className={FIELD_COMPACT}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={saving}
              onClick={() => void saveLimits()}
            >
              {saving ? "Saving…" : "Save limits"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          Recent sends
        </p>
        {provider.recent.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No sends through this tool yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200">
            {provider.recent.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  to={`/console/emails/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 text-sm hover:text-[#0A4BD6]"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-neutral-800">{row.message_id}</span>
                    <span className="mt-0.5 block truncate text-neutral-500">{row.subject}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                    {row.status} · {formatSentAgo(row.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5">
      <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function UsageBar({
  title,
  used,
  limit,
  ratio,
}: {
  title: string;
  used: number;
  limit: number | null;
  ratio: number;
}) {
  return (
    <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{title}</p>
        <p className="font-mono text-xs text-neutral-500">
          {formatCount(used)}
          {limit != null ? ` / ${formatCount(limit)}` : " · uncapped"}
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-sm bg-neutral-200">
        <div
          className="h-full bg-[#0A4BD6] transition-[width]"
          style={{ width: limit == null ? "0%" : `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {limit == null
          ? "No soft limit configured for this window."
          : `${Math.round(ratio * 100)}% of the configured cap.`}
      </p>
    </div>
  );
}

function webhookResultNote(link: ProviderWebhookLink): string {
  if (link.signing_secret_once) {
    return "Webhook created. Copy the one-time signing secret from the API response into WEBHOOK_SECRET_* immediately.";
  }
  if (link.created) return "Webhook created on the tool.";
  if (link.linked) return "Webhook already linked — nothing to create.";
  return link.detail || "Webhook sync finished.";
}

function StatusTable({
  title,
  counts,
}: {
  title: string;
  counts: ProviderStatusCounts;
}) {
  const total = STATUS_ROWS.reduce((sum, row) => sum + (counts[row.key] || 0), 0);
  return (
    <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{title}</p>
        <p className="font-mono text-xs text-neutral-500">{formatCount(total)} total</p>
      </div>
      <ul className="mt-4 space-y-2">
        {STATUS_ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-600">{row.label}</span>
            <span className="font-mono text-neutral-900">{formatCount(counts[row.key] || 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

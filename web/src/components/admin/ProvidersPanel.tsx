import { ArrowDown, ArrowUp, Cable, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BTN_GHOST, BTN_PRIMARY } from "../../lib/consoleUi";
import {
  type ProviderItem,
  type ProvidersResponse,
  domainStatsLabel,
  fetchProviders,
  roleLabel,
  updateProviders,
} from "../../lib/providers";
import { useConsoleAccount } from "./consoleAccount";
import { PageLoading } from "../ui/ScanLoading";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function usageHint(item: ProviderItem): string {
  const day = item.daily_limit
    ? `${formatCount(item.usage.sent_today)} / ${formatCount(item.daily_limit)} today`
    : `${formatCount(item.usage.sent_today)} today`;
  const month = item.monthly_limit
    ? `${formatCount(item.usage.sent_month)} / ${formatCount(item.monthly_limit)} month`
    : `${formatCount(item.usage.sent_month)} this month`;
  return `${day} · ${month}`;
}

export default function ProvidersPanel() {
  const navigate = useNavigate();
  const account = useConsoleAccount();
  const isAdmin = account.isAdmin;
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProviders()
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load providers.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ordered = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => {
      if (a.id === "ses") return -1;
      if (b.id === "ses") return 1;
      return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
    });
  }, [data]);

  async function persist(items: Parameters<typeof updateProviders>[0]) {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateProviders(items);
      setData(next);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not update providers.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: ProviderItem) {
    await persist([{ id: item.id, enabled: !item.enabled }]);
  }

  async function move(item: ProviderItem, direction: -1 | 1) {
    const fallbacks = ordered.filter((row) => row.id !== "ses");
    const index = fallbacks.findIndex((row) => row.id === item.id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= fallbacks.length) return;
    const next = [...fallbacks];
    const [row] = next.splice(index, 1);
    next.splice(swapWith, 0, row);
    await persist(next.map((entry, order) => ({ id: entry.id, sort_order: (order + 1) * 10 })));
  }

  if (!data) {
    return (
      <div>
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {error ? null : <PageLoading>Loading…</PageLoading>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Routing</p>
        <p className="mt-2 text-sm text-neutral-700">
          Policy <span className="font-medium text-neutral-950">{data.policy}</span>: Amazon SES is tried
          first when it is available, then the fallback chain.
        </p>
        <p className="mt-3 font-mono text-xs text-neutral-500">
          Effective order: {data.effective_order.length ? data.effective_order.join(" → ") : "none configured"}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-950">Providers</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Open a tool for consumption stats. Disable one without removing the others.
            </p>
          </div>
          {saving ? <p className="text-xs text-neutral-400">Saving…</p> : null}
        </div>

        <ul className="divide-y divide-neutral-200 rounded-sm border border-neutral-200 bg-white">
          {ordered.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => navigate(`/console/providers/${item.id}`)}
                className="min-w-0 flex-1 text-left transition-colors hover:text-[#0A4BD6]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Cable className="size-4 text-neutral-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-neutral-950">{item.label}</p>
                  <span className="rounded-sm bg-neutral-100 px-2 py-0.5 font-mono text-[10px] tracking-wide text-neutral-600 uppercase">
                    {roleLabel(item.role)}
                  </span>
                  {item.testing ? (
                    <span className="rounded-sm bg-amber-50 px-2 py-0.5 font-mono text-[10px] tracking-wide text-amber-700 uppercase">
                      Testing
                    </span>
                  ) : null}
                  {!item.connected ? (
                    <span className="rounded-sm bg-orange-50 px-2 py-0.5 font-mono text-[10px] tracking-wide text-orange-700 uppercase">
                      Missing key
                    </span>
                  ) : item.domain_capable === false ? (
                    <span className="rounded-sm bg-amber-50 px-2 py-0.5 font-mono text-[10px] tracking-wide text-amber-700 uppercase">
                      Send only
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-neutral-500">{usageHint(item)}</p>
                <p className="mt-1 font-mono text-[11px] text-neutral-500">
                  {domainStatsLabel(item.domains)}
                </p>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {item.id !== "ses" && isAdmin ? (
                  <>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      disabled={saving}
                      onClick={() => void move(item, -1)}
                      aria-label={`Move ${item.label} up`}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      disabled={saving}
                      onClick={() => void move(item, 1)}
                      aria-label={`Move ${item.label} down`}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    className={item.enabled ? BTN_GHOST : BTN_PRIMARY}
                    disabled={saving}
                    onClick={() => void toggleEnabled(item)}
                  >
                    {item.enabled ? "Disable" : "Enable"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={BTN_GHOST}
                  aria-label={`Open ${item.label} stats`}
                  onClick={() => navigate(`/console/providers/${item.id}`)}
                >
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

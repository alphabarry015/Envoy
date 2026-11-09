import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiBase } from "../lib/apiBase";
import { authHeader } from "../lib/auth";
import { formatSentAgo } from "../lib/emails";
import { providerLabel } from "../lib/providerOptions";
import InviteBadge from "../components/admin/InviteBadge";
import { PageLoading } from "../components/ui/ScanLoading";

type OverviewActivity = {
  id: string;
  message_id: string;
  subject: string;
  status: string;
  provider?: string | null;
  kind?: string;
  created_at: string;
};

type Overview = {
  sends_today: number;
  daily_send_quota: number | null;
  domains_live: number;
  max_domains: number | null;
  active_api_keys: number;
  bounce_rate: number;
  recent: OverviewActivity[];
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function OverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = apiBase();
    fetch(`${baseUrl}/api/v1/overview`, { headers: authHeader() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the overview.");
        return (await response.json()) as Overview;
      })
      .then((body) => {
        if (!cancelled) setOverview(body);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the overview.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = overview
    ? [
        {
          label: "Sends today",
          value: formatCount(overview.sends_today),
          hint: overview.daily_send_quota
            ? `/ ${formatCount(overview.daily_send_quota)} quota`
            : "no daily limit",
        },
        {
          label: "Domains live",
          value: formatCount(overview.domains_live),
          hint: overview.max_domains ? `/ ${formatCount(overview.max_domains)} allowed` : "verified",
        },
        {
          label: "API keys",
          value: formatCount(overview.active_api_keys),
          hint: "active",
        },
        {
          label: "Bounce rate",
          value: `${overview.bounce_rate}%`,
          hint: "last 7 days",
        },
      ]
    : [];

  if (!overview) {
    return (
      <div>
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {error ? null : (
          <PageLoading>Loading…</PageLoading>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-sm border border-neutral-200 bg-neutral-50 p-5">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{stat.hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Recent activity</p>
        {overview.recent.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No sends yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {overview.recent.map((row) => (
              <li key={row.id} className="border-b border-neutral-200 pb-3 text-sm last:border-0 last:pb-0">
                <Link
                  to={`/console/emails/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 hover:text-[#0A4BD6]"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-neutral-700">{row.message_id}</span>
                    <span className="mt-0.5 block text-neutral-600">
                      {row.subject}
                      <InviteBadge kind={row.kind} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[11px] text-[#0A4BD6]">
                      {row.provider ? providerLabel(row.provider) : "—"}
                    </span>
                    <span className="mt-0.5 block text-neutral-400">{formatSentAgo(row.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

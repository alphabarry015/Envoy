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
  recent_page?: number;
  recent_page_size?: number;
  recent_total?: number;
  all_time?: {
    total: number;
    by_status: Record<string, number>;
    by_provider: Record<string, number>;
  };
};

/** Raw statuses grouped into what an operator acts on. */
const OUTCOMES: {
  id: string;
  label: string;
  hint: string;
  statuses: string[];
  dot: string;
  bar: string;
  text: string;
}[] = [
  {
    id: "delivered",
    label: "Delivered",
    hint: "reached the inbox server",
    statuses: ["delivered"],
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  {
    id: "in_flight",
    label: "In flight",
    hint: "queued or awaiting a receipt",
    statuses: ["queued", "sent"],
    dot: "bg-[#0A4BD6]",
    bar: "bg-[#0A4BD6]",
    text: "text-[#0A4BD6]",
  },
  {
    id: "bounced",
    label: "Bounced",
    hint: "rejected or marked as spam",
    statuses: ["bounced", "complained"],
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-700",
  },
  {
    id: "failed",
    label: "Failed",
    hint: "refused or suppressed",
    statuses: ["failed", "suppressed"],
    dot: "bg-red-500",
    bar: "bg-red-500",
    text: "text-red-700",
  },
];

const LABEL = "font-mono text-[11px] tracking-widest text-neutral-400 uppercase";

function AllTimeSection({ allTime }: { allTime: NonNullable<Overview["all_time"]> }) {
  const outcomes = OUTCOMES.map((item) => ({
    ...item,
    count: item.statuses.reduce((sum, id) => sum + (allTime.by_status[id] ?? 0), 0),
  }));
  const providers = Object.entries(allTime.by_provider).sort((a, b) => b[1] - a[1]);
  const share = (count: number) =>
    allTime.total === 0 ? 0 : Math.round((count * 1000) / allTime.total) / 10;
  const delivered = outcomes.find((item) => item.id === "delivered")?.count ?? 0;

  return (
    <section className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
      <div className="flex flex-wrap items-end justify-between gap-6 p-5 md:p-7">
        <div>
          <p className={LABEL}>All time</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            {formatCount(allTime.total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">emails sent since the first send</p>
        </div>
        {allTime.total > 0 ? (
          <div className="text-right">
            <p className={LABEL}>Delivery rate</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-emerald-700">
              {share(delivered)}%
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatCount(delivered)} of {formatCount(allTime.total)} delivered
            </p>
          </div>
        ) : null}
      </div>

      {allTime.total === 0 ? (
        <p className="border-t border-neutral-200 px-5 py-4 text-sm text-neutral-500 md:px-7">
          No sends yet.
        </p>
      ) : (
        <>
          <div className="px-5 md:px-7">
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-neutral-200"
              role="img"
              aria-label={outcomes
                .filter((item) => item.count > 0)
                .map((item) => `${item.label} ${share(item.count)}%`)
                .join(", ")}
            >
              {outcomes
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span
                    key={item.id}
                    className={`${item.bar} min-w-1.5`}
                    style={{ width: `${share(item.count)}%` }}
                    title={`${item.label}: ${formatCount(item.count)}`}
                  />
                ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 border-t border-neutral-200 lg:grid-cols-4">
            {outcomes.map((item, index) => (
              <div
                key={item.id}
                className={`p-5 md:px-7 ${index % 2 === 1 ? "border-l border-neutral-200" : ""} ${
                  index >= 2 ? "border-t border-neutral-200 lg:border-t-0" : ""
                } ${index === 2 ? "lg:border-l" : ""}`}
              >
                <p className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className={`size-2 rounded-full ${item.dot}`} aria-hidden="true" />
                  {item.label}
                </p>
                <p
                  className={`mt-2 text-2xl font-semibold tracking-tight ${
                    item.count > 0 ? item.text : "text-neutral-300"
                  }`}
                >
                  {formatCount(item.count)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-neutral-400">
                  {share(item.count)}% · {item.hint}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200 p-5 md:p-7">
            <p className={LABEL}>By sending tool</p>
            <ul className="mt-4 space-y-3">
              {providers.map(([id, count]) => (
                <li key={id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-neutral-800">
                      {id === "unknown" ? "Unknown" : providerLabel(id)}
                    </span>
                    <span className="font-mono text-neutral-600">
                      {formatCount(count)}
                      <span className="ml-2 inline-block w-12 text-right text-neutral-400">
                        {share(count)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className="h-full rounded-full bg-[#0A4BD6]"
                      style={{ width: `${share(count)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function OverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = apiBase();
    setPageLoading(true);
    fetch(`${baseUrl}/api/v1/overview?recent_page=${page}`, { headers: authHeader() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the overview.");
        return (await response.json()) as Overview;
      })
      .then((body) => {
        if (!cancelled) setOverview(body);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the overview.");
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

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

  const pageSize = overview.recent_page_size ?? 10;
  const recentTotal = overview.recent_total ?? overview.recent.length;
  const currentPage = overview.recent_page ?? page;
  const totalPages = Math.max(1, Math.ceil(recentTotal / pageSize));
  const firstRow = recentTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, recentTotal);

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
      {overview.all_time ? <AllTimeSection allTime={overview.all_time} /> : null}
      <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Recent activity</p>
        {overview.recent.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No sends yet.</p>
        ) : (
          <ul
            className={`mt-4 space-y-3 transition-opacity ${pageLoading ? "opacity-50" : ""}`}
            aria-busy={pageLoading}
          >
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
        {totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-sm">
            <span className="font-mono text-[11px] text-neutral-500">
              {formatCount(firstRow)}–{formatCount(lastRow)} of {formatCount(recentTotal)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-sm border border-neutral-200 px-3 text-neutral-700 transition-colors hover:border-[#0A4BD6]/30 hover:text-[#0A4BD6] disabled:pointer-events-none disabled:opacity-40"
                disabled={currentPage <= 1 || pageLoading}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span className="font-mono text-[11px] text-neutral-500">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-sm border border-neutral-200 px-3 text-neutral-700 transition-colors hover:border-[#0A4BD6]/30 hover:text-[#0A4BD6] disabled:pointer-events-none disabled:opacity-40"
                disabled={currentPage >= totalPages || pageLoading}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

import { accountInitials, accountName } from "../../lib/account";
import { authHeader } from "../../lib/auth";
import { KICKER } from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";

type Account = {
  email: string;
  role: string;
  status: string;
  max_domains: number | null;
  daily_send_quota: number | null;
  monthly_send_quota: number | null;
  can_create_api_keys: boolean;
  created_at: string;
};

function roleLabel(role: string): string {
  return role === "admin" ? "Admin" : "Member";
}

function limitLabel(value: number | null): string {
  if (value === null) return "Unlimited";
  return new Intl.NumberFormat("en").format(value);
}

function memberSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function statusTone(status: string): string {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "pending") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-600";
}

export default function ProfilePage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
    fetch(`${baseUrl}/api/v1/auth/me`, { headers: authHeader() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this profile.");
        return (await response.json()) as Account;
      })
      .then((body) => {
        if (!cancelled) setAccount(body);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load this profile.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) {
    return (
      <div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {error ? null : (
          <PageLoading>Loading…</PageLoading>
        )}
      </div>
    );
  }

  const name = accountName(account.email);
  const details = [
    { label: "Email", value: account.email },
    { label: "Role", value: roleLabel(account.role) },
    { label: "Status", value: account.status },
    { label: "Member since", value: memberSince(account.created_at) },
    { label: "API keys", value: account.can_create_api_keys ? "Allowed" : "Disabled" },
  ];
  const limits = [
    { label: "Daily sends", value: limitLabel(account.daily_send_quota) },
    { label: "Monthly sends", value: limitLabel(account.monthly_send_quota) },
    { label: "Domains", value: limitLabel(account.max_domains) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-6">
        <span
          className="inline-flex size-16 items-center justify-center rounded-sm bg-[#0A4BD6] text-lg font-semibold tracking-wide text-white"
          aria-hidden="true"
        >
          {accountInitials(name)}
        </span>
        <h2 className="mt-5 truncate text-xl font-semibold tracking-tight text-neutral-950">{name}</h2>
        <p className="mt-1 truncate text-sm text-neutral-500">{account.email}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-sm bg-[#0A4BD6]/10 px-2 py-0.5 font-mono text-[11px] tracking-wide text-[#0A4BD6] uppercase">
            {roleLabel(account.role)}
          </span>
          <span className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] uppercase ${statusTone(account.status)}`}>
            {account.status}
          </span>
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
          <p className={KICKER}>Account</p>
          <dl className="mt-5 divide-y divide-neutral-200">
            {details.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <dt className="text-sm text-neutral-500">{row.label}</dt>
                <dd className="text-sm font-medium text-neutral-950">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
          <p className={KICKER}>Sending limits</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            {limits.map((row) => (
              <div key={row.label} className="rounded-sm border border-neutral-200 bg-white px-4 py-4">
                <dt className="text-xs text-neutral-500">{row.label}</dt>
                <dd className="mt-2 text-lg font-semibold tracking-tight text-neutral-950">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

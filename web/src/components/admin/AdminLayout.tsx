import {
  FlaskConical,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { readSession, signOut } from "../../lib/auth";
import { getStoredDomain } from "../../lib/domains";

type AdminView =
  | "overview"
  | "domains"
  | "api-keys"
  | "logs"
  | "users"
  | "suppression";

const NAV: Array<{ id: AdminView; label: string; icon: typeof Globe; path: string }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, path: "/console/overview" },
  { id: "domains", label: "Domains", icon: Globe, path: "/console/domains" },
  { id: "api-keys", label: "API Keys", icon: KeyRound, path: "/console/api-keys" },
  { id: "logs", label: "Email Logs", icon: Mail, path: "/console/logs" },
  { id: "users", label: "Users & Invites", icon: Users, path: "/console/users" },
  { id: "suppression", label: "Suppression", icon: Shield, path: "/console/suppression" },
];

const PAGE_META: Record<AdminView, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Monitor sends, domains, keys, and invite-only seats.",
  },
  domains: {
    title: "Domains",
    description: "Declare sending identities and verify Easy DKIM / SPF / DMARC.",
  },
  "api-keys": {
    title: "API Keys",
    description: "Generate hashed workspace keys and revoke them instantly.",
  },
  logs: {
    title: "Email Logs",
    description: "Delivery, bounce, and complaint events from AWS SNS.",
  },
  users: {
    title: "Users & Invites",
    description: "Issue invite tokens and manage domain / send quotas.",
  },
  suppression: {
    title: "Suppression",
    description: "Hard bounces and complaints blocked before SES is called.",
  },
};

function resolveView(pathname: string): AdminView {
  if (pathname.startsWith("/console/domains")) return "domains";
  if (pathname.startsWith("/console/api-keys")) return "api-keys";
  if (pathname.startsWith("/console/logs")) return "logs";
  if (pathname.startsWith("/console/users")) return "users";
  if (pathname.startsWith("/console/suppression")) return "suppression";
  return "overview";
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const session = useMemo(() => readSession(), []);
  const view = resolveView(pathname);
  const domainMatch = pathname.match(/^\/console\/domains\/([^/]+)/);
  const domain = domainMatch ? getStoredDomain(domainMatch[1]) : null;

  if (!session) {
    return <Navigate to="/console/login" replace />;
  }

  function logout() {
    signOut();
    navigate("/console/login", { replace: true });
  }

  const title = domain ? "DNS Records" : PAGE_META[view].title;
  const description = domain
    ? "Identity configuration, verification steps, and registrar records."
    : PAGE_META[view].description;

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-white text-neutral-950">
      <div className="relative z-10 flex h-full w-full">
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 px-5 py-6 lg:px-6 lg:py-8">
          <Link to="/" className="mb-6 flex shrink-0 items-center gap-2.5 px-1 py-1">
            <span className="inline-block size-2 shrink-0 bg-[#0A4BD6]" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-[0.18em] text-neutral-950">
              ENVOY
            </span>
          </Link>

          <nav aria-label="Admin" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-[#0A4BD6] font-medium text-white"
                      : "text-neutral-600 hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6]"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 shrink-0 space-y-3 border-t border-neutral-200 pt-4">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="inline-flex w-full items-center justify-between gap-2 rounded-sm border border-dashed border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-400"
            >
              <span className="inline-flex items-center gap-2">
                <FlaskConical className="size-3.5" aria-hidden="true" />
                Sandbox
              </span>
              <span className="font-mono text-[10px] tracking-widest uppercase">
                Soon
              </span>
            </button>
            <p className="truncate font-mono text-[11px] tracking-wide text-neutral-400">
              {session.email}
            </p>
            <button
              type="button"
              onClick={logout}
              className="inline-flex w-full items-center gap-2 rounded-sm border border-[#0A4BD6]/25 bg-[#0A4BD6]/5 px-3 py-2 text-sm text-[#0A4BD6] transition-colors hover:bg-[#0A4BD6]/10"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 md:px-10 lg:px-12">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">{description}</p>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-10 md:py-8 lg:px-12">
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}

import {
  FlaskConical,
  Globe,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { readSession, signOut } from "../../lib/auth";
import { PORTAL_SURFACE } from "../../lib/consoleUi";
import { getStoredDomain } from "../../lib/domains";
import { getStoredLog } from "../../lib/emailLogs";
import { getStoredTemplate } from "../../lib/templates";

type AdminView =
  | "overview"
  | "domains"
  | "templates"
  | "api-keys"
  | "logs"
  | "users"
  | "suppression";

const NAV: Array<{ id: AdminView; label: string; icon: typeof Globe; path: string }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, path: "/console/overview" },
  { id: "domains", label: "Domains", icon: Globe, path: "/console/domains" },
  { id: "templates", label: "Templates", icon: LayoutTemplate, path: "/console/templates" },
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
  templates: {
    title: "Templates",
    description: "Reusable HTML and text messages addressed by alias.",
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
  if (pathname.startsWith("/console/templates")) return "templates";
  if (pathname.startsWith("/console/api-keys")) return "api-keys";
  if (pathname.startsWith("/console/logs")) return "logs";
  if (pathname.startsWith("/console/users")) return "users";
  if (pathname.startsWith("/console/suppression")) return "suppression";
  return "overview";
}

const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useMemo(() => readSession(), []);
  const view = resolveView(pathname);
  const domainMatch = pathname.match(/^\/console\/domains\/([^/]+)/);
  const domain = domainMatch ? getStoredDomain(domainMatch[1]) : null;
  const logMatch = pathname.match(/^\/console\/logs\/([^/]+)/);
  const log = logMatch ? getStoredLog(logMatch[1]) : null;
  const templateMatch = pathname.match(/^\/console\/templates\/([^/]+)/);
  const gallery = templateMatch?.[1] === "gallery";
  const template = templateMatch && !gallery ? getStoredTemplate(templateMatch[1]) : null;
  const templateEditor = Boolean(templateMatch) && !gallery;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!session) {
    return <Navigate to="/console/login" replace />;
  }

  function logout() {
    setMenuOpen(false);
    signOut();
    navigate("/console/login", { replace: true });
  }

  const title = domain
    ? "DNS Records"
    : log
      ? log.subject
      : gallery
        ? "Templates"
        : template
          ? template.name
          : PAGE_META[view].title;
  const description = domain
    ? "Identity configuration, verification steps, and registrar records."
    : log
      ? `${log.messageId} · ${log.status}`
      : gallery
        ? "Use one to add it to this console."
        : template
          ? template.alias
          : PAGE_META[view].description;

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-white text-neutral-950">
      <div className="relative z-10 flex h-full w-full">
        {!templateEditor ? (
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
            <p className="truncate font-mono text-[11px] tracking-wide text-neutral-400">
              {session.email}
            </p>
            <div ref={menuRef} className="relative">
              {menuOpen ? (
                <div
                  role="menu"
                  className={`absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-sm py-1 ${PORTAL_SURFACE}`}
                >
                  <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => setMenuOpen(false)}>
                    <User className="size-3.5" aria-hidden="true" />
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    title="Coming soon"
                    className={`${MENU_ITEM} justify-between disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-700`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FlaskConical className="size-3.5" aria-hidden="true" />
                      Sandbox
                    </span>
                    <span className="font-mono text-[10px] tracking-widest uppercase">Soon</span>
                  </button>
                  <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => setMenuOpen(false)}>
                    <Settings className="size-3.5" aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    onClick={logout}
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex w-full items-center gap-2 rounded-sm border border-[#0A4BD6]/25 bg-[#0A4BD6]/5 px-3 py-2 text-sm text-[#0A4BD6] transition-colors hover:bg-[#0A4BD6]/10"
              >
                <User className="size-3.5" aria-hidden="true" />
                Profile
              </button>
            </div>
          </div>
        </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!templateEditor ? (
            <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 md:px-10 lg:px-12">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-neutral-500">{description}</p>
            </header>
          ) : null}

          <section
            className={
              templateEditor
                ? "min-h-0 flex-1 overflow-hidden"
                : "min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-10 md:py-8 lg:px-12"
            }
          >
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}

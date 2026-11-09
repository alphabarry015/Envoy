import {
  Cable,
  FlaskConical,
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
  Settings,
  Shield,
  User,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { apiBase } from "../../lib/apiBase";

import {
  PROFILE_NAME_EVENT,
  accountInitials,
  displayNameOf,
} from "../../lib/account";
import { authHeader, readSession, signOut } from "../../lib/auth";
import { ToastProvider } from "../ui/Toast";
import { ConsoleAccountProvider } from "./consoleAccount";
import RealtimeBridge from "./RealtimeBridge";
import { PORTAL_SURFACE } from "../../lib/consoleUi";

type AdminView =
  | "overview"
  | "emails"
  | "domains"
  | "providers"
  | "templates"
  | "api-keys"
  | "webhooks"
  | "logs"
  | "users"
  | "suppression"
  | "profile"
  | "settings";

const NAV: Array<{
  id: AdminView;
  label: string;
  icon: typeof Globe;
  path: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    path: "/console/overview",
  },
  { id: "emails", label: "Emails", icon: Inbox, path: "/console/emails" },
  { id: "domains", label: "Domains", icon: Globe, path: "/console/domains" },
  {
    id: "providers",
    label: "Providers",
    icon: Cable,
    path: "/console/providers",
  },
  {
    id: "templates",
    label: "Templates",
    icon: LayoutTemplate,
    path: "/console/templates",
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: KeyRound,
    path: "/console/api-keys",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    icon: Webhook,
    path: "/console/webhooks",
  },
  { id: "logs", label: "Logs", icon: Mail, path: "/console/logs" },
  {
    id: "users",
    label: "Users & Invites",
    icon: Users,
    path: "/console/users",
  },
  {
    id: "suppression",
    label: "Suppression",
    icon: Shield,
    path: "/console/suppression",
  },
];

const PAGE_META: Record<AdminView, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Monitor sends, domains, keys, and invite-only seats.",
  },
  emails: {
    title: "Emails",
    description:
      "Sent and received messages, with delivery and engagement status.",
  },
  domains: {
    title: "Domains",
    description:
      "Declare sending identities and verify Easy DKIM / SPF / DMARC.",
  },
  providers: {
    title: "Providers",
    description: "Choose sending tools, failover order, and watch consumption.",
  },
  templates: {
    title: "Templates",
    description: "Reusable HTML and text messages addressed by alias.",
  },
  "api-keys": {
    title: "API Keys",
    description: "Generate hashed workspace keys and revoke them instantly.",
  },
  webhooks: {
    title: "Webhooks",
    description:
      "Create endpoints that receive delivery, bounce, and complaint events.",
  },
  logs: {
    title: "Logs",
    description: "Delivery, bounce, and complaint events from AWS SNS.",
  },
  users: {
    title: "Users & Invites",
    description: "Email activation links and manage domain / send quotas.",
  },
  suppression: {
    title: "Suppression",
    description: "Hard bounces and complaints blocked before SES is called.",
  },
  profile: {
    title: "Profile",
    description: "Account identity, role, and sending limits.",
  },
  settings: {
    title: "Settings",
    description: "Password and session for this account.",
  },
};

function resolveView(pathname: string): AdminView {
  if (pathname.startsWith("/console/emails")) return "emails";
  if (pathname.startsWith("/console/domains")) return "domains";
  if (pathname.startsWith("/console/providers")) return "providers";
  if (pathname.startsWith("/console/templates")) return "templates";
  if (pathname.startsWith("/console/api-keys")) return "api-keys";
  if (pathname.startsWith("/console/webhooks")) return "webhooks";
  if (pathname.startsWith("/console/logs")) return "logs";
  if (pathname.startsWith("/console/users")) return "users";
  if (pathname.startsWith("/console/suppression")) return "suppression";
  if (pathname.startsWith("/console/profile")) return "profile";
  if (pathname.startsWith("/console/settings")) return "settings";
  return "overview";
}

const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const session = useMemo(() => readSession(), []);
  const view = resolveView(pathname);
  const domainDetail = /^\/console\/domains\/([^/]+)/.test(pathname);
  const providerDetail = /^\/console\/providers\/([^/]+)/.test(pathname);
  const templateMatch = pathname.match(/^\/console\/templates\/([^/]+)/);
  const gallery = templateMatch?.[1] === "gallery";
  const templateEditor = Boolean(templateMatch) && !gallery;
  const immersive = templateEditor || gallery;
  const visibleNav = NAV.filter(
    (item) =>
      (item.id !== "users" && item.id !== "providers") || role === "admin",
  );

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const baseUrl = apiBase();
    fetch(`${baseUrl}/api/v1/auth/me`, { headers: authHeader() })
      .then(async (response) => {
        if (response.status === 401) {
          signOut();
          navigate("/console/login", { replace: true });
          return null;
        }
        if (!response.ok) return "user" as const;
        const body = (await response.json()) as {
          role?: string;
          display_name?: string | null;
        };
        if (!cancelled) setDisplayName(body.display_name ?? null);
        return body.role === "admin" ? ("admin" as const) : ("user" as const);
      })
      .then((next) => {
        if (!cancelled && next) setRole(next);
      })
      .catch(() => {
        if (!cancelled) setRole("user");
      });
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  useEffect(() => {
    function onName(event: Event) {
      setDisplayName((event as CustomEvent<string | null>).detail ?? null);
    }
    window.addEventListener(PROFILE_NAME_EVENT, onName);
    return () => window.removeEventListener(PROFILE_NAME_EVENT, onName);
  }, []);

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

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  if (!session) {
    return <Navigate to="/console/login" replace />;
  }

  function logout() {
    setMenuOpen(false);
    signOut();
    navigate("/console/login", { replace: true });
  }

  const profileName = displayNameOf(session.email, displayName);
  const profileInitials = accountInitials(profileName);

  const title = domainDetail
    ? "DNS Records"
    : providerDetail
      ? "Provider usage"
      : gallery
        ? "Templates"
        : PAGE_META[view].title;
  const description = domainDetail
    ? "Identity configuration, verification steps, and registrar records."
    : providerDetail
      ? "Consumption, delivery status, soft limits, and recent sends for this tool."
      : gallery
        ? "Use one to add it to this console."
        : PAGE_META[view].description;

  return (
    <ToastProvider>
      <ConsoleAccountProvider
        value={{ ready: role !== null, isAdmin: role === "admin" }}
      >
        <RealtimeBridge />
        <main className="relative flex h-svh flex-col overflow-hidden bg-white text-neutral-950">
          <div className="relative z-10 flex h-full w-full">
            {!immersive ? (
              <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 px-5 py-6 lg:flex lg:px-6 lg:py-8">
                <Link
                  to="/"
                  className="mb-6 flex shrink-0 items-center gap-2.5 px-1 py-1"
                >
                  <span
                    className="inline-block size-2 shrink-0 bg-[#0A4BD6]"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tracking-[0.18em] text-neutral-950">
                    ENVOY
                  </span>
                </Link>

                <nav
                  aria-label="Admin"
                  className="min-h-0 flex-1 space-y-1 overflow-y-auto"
                >
                  {visibleNav.map((item) => {
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
                        <Icon
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-6 shrink-0 border-t border-neutral-200 pt-4">
                  <div ref={menuRef} className="relative">
                    {menuOpen ? (
                      <div
                        role="menu"
                        className={`absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-sm py-1 ${PORTAL_SURFACE}`}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className={MENU_ITEM}
                          onClick={() => {
                            setMenuOpen(false);
                            navigate("/console/profile");
                          }}
                        >
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
                            <FlaskConical
                              className="size-3.5"
                              aria-hidden="true"
                            />
                            Sandbox
                          </span>
                          <span className="font-mono text-[10px] tracking-widest uppercase">
                            Soon
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={MENU_ITEM}
                          onClick={() => {
                            setMenuOpen(false);
                            navigate("/console/settings");
                          }}
                        >
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
                      aria-label={`${profileName} account menu`}
                      onClick={() => setMenuOpen((open) => !open)}
                      className={`flex w-full items-center gap-2.5 rounded-sm px-1 py-1.5 text-left transition-colors hover:bg-[#0A4BD6]/10 ${
                        view === "profile" || view === "settings"
                          ? "bg-[#0A4BD6]/10"
                          : ""
                      }`}
                    >
                      <span
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-[#0A4BD6] text-[11px] font-semibold tracking-wide text-white"
                        aria-hidden="true"
                      >
                        {profileInitials}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium text-neutral-950">
                        {profileName}
                      </span>
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
            {navOpen ? (
              <div className="fixed inset-0 z-40 lg:hidden">
                <button
                  type="button"
                  aria-label="Close menu"
                  className="absolute inset-0 bg-neutral-950/40"
                  onClick={() => setNavOpen(false)}
                />
                <aside className="relative flex h-full w-[min(18rem,88vw)] flex-col border-r border-neutral-200 bg-neutral-50 px-5 py-6">
                  <div className="mb-4 flex items-center justify-between">
                    <Link
                      to="/"
                      className="flex items-center gap-2.5 px-1 py-1"
                      onClick={() => setNavOpen(false)}
                    >
                      <span
                        className="inline-block size-2 shrink-0 bg-[#0A4BD6]"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold tracking-[0.18em] text-neutral-950">
                        ENVOY
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="inline-flex size-10 items-center justify-center rounded-sm text-neutral-700"
                      onClick={() => setNavOpen(false)}
                    >
                      <X className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                  <nav
                    id="console-nav"
                    aria-label="Admin"
                    className="min-h-0 flex-1 space-y-1 overflow-y-auto"
                  >
                    {visibleNav.map((item) => {
                      const Icon = item.icon;
                      const active = view === item.id;
                      return (
                        <Link
                          key={item.id}
                          to={item.path}
                          onClick={() => setNavOpen(false)}
                          className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-3 text-left text-sm transition-colors ${
                            active
                              ? "bg-[#0A4BD6] font-medium text-white"
                              : "text-neutral-600 hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6]"
                          }`}
                        >
                          <Icon
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                  <div className="mt-4 shrink-0 space-y-1 border-t border-neutral-200 pt-4">
                    <Link
                      to="/console/profile"
                      onClick={() => setNavOpen(false)}
                      className="flex items-center gap-2.5 rounded-sm px-3 py-3 text-sm text-neutral-700 hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6]"
                    >
                      <User className="size-4" aria-hidden="true" />
                      Profile
                    </Link>
                    <Link
                      to="/console/settings"
                      onClick={() => setNavOpen(false)}
                      className="flex items-center gap-2.5 rounded-sm px-3 py-3 text-sm text-neutral-700 hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6]"
                    >
                      <Settings className="size-4" aria-hidden="true" />
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2.5 rounded-sm px-3 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </aside>
              </div>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!immersive ? (
                <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 bg-white px-4 py-4 md:px-10 md:py-5 lg:px-12">
                  <button
                    type="button"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-800 lg:hidden"
                    aria-expanded={navOpen}
                    aria-controls="console-nav"
                    onClick={() => setNavOpen(true)}
                  >
                    <Menu className="size-5" aria-hidden="true" />
                    <span className="sr-only">Open menu</span>
                  </button>
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight md:text-3xl">
                      {title}
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                      {description}
                    </p>
                  </div>
                </header>
              ) : (
                <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 lg:hidden">
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-sm border border-neutral-200 text-neutral-800"
                    onClick={() => setNavOpen(true)}
                  >
                    <Menu className="size-5" aria-hidden="true" />
                    <span className="sr-only">Open menu</span>
                  </button>
                  <p className="min-w-0 truncate text-sm font-medium">
                    {title}
                  </p>
                </div>
              )}

              <section
                className={
                  immersive
                    ? "min-h-0 flex-1 overflow-hidden"
                    : "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 md:px-10 md:py-8 lg:px-12"
                }
              >
                <Outlet />
              </section>
            </div>
          </div>
        </main>
      </ConsoleAccountProvider>
    </ToastProvider>
  );
}

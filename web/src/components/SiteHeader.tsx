import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { NAV_ITEMS, isNavActive, navTarget } from "../lib/nav";
import GithubRepoLink from "./ui/GithubRepoLink";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A4BD6]";

type SiteHeaderProps = {
  variant?: "overlay" | "solid";
};

export default function SiteHeader({ variant = "overlay" }: SiteHeaderProps) {
  const { pathname, hash } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const barClass =
    variant === "solid"
      ? "bg-[#0A4BD6]"
      : "bg-transparent";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, hash]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <header className={`relative z-30 ${barClass}`}>
      <div className="mx-auto grid w-full max-w-[92rem] grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 md:px-8 md:py-6 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          to="/"
          className={`flex items-center gap-2.5 justify-self-start rounded-sm text-lg font-semibold tracking-[0.18em] text-white ${FOCUS}`}
        >
          <span className="inline-block size-2 shrink-0 bg-white" aria-hidden="true" />
          ENVOY
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center justify-self-center rounded-sm border border-white/10 bg-white/10 px-1.5 py-1.5 backdrop-blur-md lg:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item, pathname, hash);
            return (
              <Link
                key={item.label}
                to={navTarget(item)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? `rounded-sm bg-white px-4 py-1.5 text-sm font-medium text-[#0A4BD6] shadow-sm ${FOCUS}`
                    : `rounded-sm px-4 py-1.5 text-sm font-medium text-white transition-colors hover:text-white/80 ${FOCUS}`
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-self-end gap-2 sm:gap-4">
          <GithubRepoLink
            className={`inline-flex items-center gap-2 rounded-sm border border-white/15 bg-white/10 px-2.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 ${FOCUS}`}
          />
          <Link
            to="/console/login"
            className={`hidden rounded-sm text-sm font-medium text-white transition-colors hover:text-white/80 sm:inline ${FOCUS}`}
          >
            Console
          </Link>
          <Link
            to="/request-access"
            className={`hidden items-center gap-2 rounded-sm bg-white py-1.5 pr-1.5 pl-4 text-sm font-medium text-[#0A4BD6] transition-opacity hover:bg-white/95 sm:inline-flex sm:pl-5 ${FOCUS}`}
          >
            <span>Request access</span>
            <span className="inline-flex size-7 items-center justify-center rounded-sm bg-[#0A4BD6] text-white">
              <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </span>
          </Link>
          <button
            type="button"
            className={`inline-flex size-10 items-center justify-center rounded-sm border border-white/10 bg-white/10 text-white lg:hidden ${FOCUS}`}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
            <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[#06245f]/50"
            onClick={() => setMobileOpen(false)}
          />
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col gap-1 overflow-y-auto bg-[#0A4BD6] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-widest text-white/80 uppercase">Pages</p>
              <button
                type="button"
                className={`inline-flex size-10 items-center justify-center rounded-sm text-white ${FOCUS}`}
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item, pathname, hash);
              return (
                <Link
                  key={item.label}
                  to={navTarget(item)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-sm px-4 py-3 text-base font-medium ${
                    active ? "bg-white text-[#0A4BD6]" : "text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <GithubRepoLink
              showLabel
              className="inline-flex items-center gap-2 rounded-sm px-4 py-3 text-base font-medium text-white hover:bg-white/10"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                to="/console/login"
                onClick={() => setMobileOpen(false)}
                className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-sm border border-white/20 px-2 text-sm font-medium text-white hover:bg-white/10 ${FOCUS}`}
              >
                Console
              </Link>
              <Link
                to="/request-access"
                onClick={() => setMobileOpen(false)}
                className={`inline-flex h-11 items-center justify-center gap-1 whitespace-nowrap rounded-sm bg-white px-2 text-[13px] font-medium text-[#0A4BD6] ${FOCUS}`}
              >
                Request access
                <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

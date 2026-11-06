import { Link } from "react-router-dom";

import GithubRepoLink from "./ui/GithubRepoLink";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0A4BD6] px-4 py-8 text-white sm:px-5 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col justify-between gap-6 md:flex-row md:items-center">
        <p className="text-sm tracking-[0.18em] font-semibold">ENVOY</p>
        <nav className="flex flex-wrap gap-5 text-sm text-white/80">
          <Link to="/docs" className="hover:text-white">
            Docs
          </Link>
          <Link to="/console/login" className="hover:text-white">
            Console
          </Link>
          <Link to="/request-access" className="hover:text-white">
            Request access
          </Link>
          <GithubRepoLink
            showLabel
            className="inline-flex items-center gap-2 hover:text-white"
          />
        </nav>
        <p className="font-mono text-[11px] tracking-wide text-white/80">
          Open source · Self-hosted · Amazon SES v2
        </p>
      </div>
    </footer>
  );
}

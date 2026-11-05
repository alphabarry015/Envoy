import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0A4BD6] px-5 py-10 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col justify-between gap-6 md:flex-row md:items-center">
        <p className="text-sm tracking-[0.18em] font-semibold">ENVOY</p>
        <nav className="flex flex-wrap gap-5 text-sm text-white/60">
          <Link to="/docs" className="hover:text-white">
            Docs
          </Link>
          <Link to="/console/login" className="hover:text-white">
            Console
          </Link>
          <Link to="/request-access" className="hover:text-white">
            Request access
          </Link>
        </nav>
        <p className="font-mono text-[11px] tracking-wide text-white/40">
          Self-hosted · AWS SES v2 · No per-domain fees
        </p>
      </div>
    </footer>
  );
}

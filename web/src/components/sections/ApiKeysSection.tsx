import { Shield, Zap } from "lucide-react";
import { useState } from "react";

import PixelAccents from "../ui/PixelAccents";
import SectionHeader from "../ui/SectionHeader";
import SplitPillButton from "../ui/SplitPillButton";

function randomKey(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 32; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `envoy_live_${token}`;
}

function Gauge({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const ratio = Math.min(value / max, 1);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-mono tracking-wide text-white/80 uppercase">{label}</span>
        <span className="text-white/80">
          {value.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-white transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

export default function ApiKeysSection() {
  const [apiKey, setApiKey] = useState("envoy_live_7kQe2mR9wLp0sVt4nHxC6yUaBdF8zJ3E");
  const [revoked, setRevoked] = useState(false);

  function generate() {
    setApiKey(randomKey());
    setRevoked(false);
  }

  return (
    <section id="api-keys" className="relative scroll-mt-8 overflow-hidden bg-[#0A4BD6] py-14 text-white md:py-28">
      <PixelAccents variant={1} />
      <div className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-8 px-4 sm:gap-12 sm:px-5 md:px-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeader
            tone="dark"
            kicker="API KEYS"
            title="API keys and sending limits"
            description="Applications authenticate with a Bearer key prefixed envoy_live_. Only a SHA-256 hash of the key is stored. Each key can carry daily and monthly quotas and a list of allowed domains, and a revoked key is rejected on the next request."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80">
              <Shield className="size-3.5 text-[#7EB0FF]" aria-hidden="true" />
              Hashed at rest
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80">
              <Zap className="size-3.5 text-[#7EB0FF]" aria-hidden="true" />
              Per-key quotas
            </span>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-sm border border-white/10 bg-[#0839B0]/70 p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] tracking-widest text-white/80 uppercase">
                Example key
              </p>
              <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] tracking-wide text-white/80">
                {revoked ? "Revoked" : "Active"}
              </span>
            </div>

            <div
              className={`mt-4 overflow-x-auto rounded-full border px-5 py-3 font-mono text-sm ${
                revoked
                  ? "border-red-400/30 bg-red-500/10 text-red-200 line-through"
                  : "border-white/15 bg-white/10 text-[#d6e8ff]"
              }`}
            >
              {revoked ? "envoy_live_•••••••••••• revoked" : apiKey}
            </div>

            <div className="mt-6 grid gap-5">
              <Gauge label="Daily send quota" value={revoked ? 0 : 1240} max={5000} />
              <Gauge label="Monthly send quota" value={revoked ? 0 : 18240} max={100000} />
              <Gauge label="Allowed domains" value={revoked ? 0 : 2} max={5} />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <SplitPillButton label="Generate key" onClick={generate} />
              <button
                type="button"
                onClick={() => setRevoked(true)}
                className="rounded-sm border border-red-400/40 px-5 py-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10"
              >
                Revoke key
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

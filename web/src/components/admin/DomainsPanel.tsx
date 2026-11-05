import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type ConsoleDomain,
  DOMAIN_PATTERN,
  createDomain,
  normalizeDomain,
  readStoredDomains,
  writeStoredDomains,
} from "../../lib/domains";
import { BTN_PRIMARY, FIELD } from "../../lib/consoleUi";

export default function DomainsPanel() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<ConsoleDomain[]>(() => readStoredDomains());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addDomain() {
    const name = normalizeDomain(input);
    setError(null);

    if (!DOMAIN_PATTERN.test(name)) {
      setError("Enter a valid domain (e.g. mail.acme.io).");
      return;
    }
    if (domains.some((domain) => domain.name === name)) {
      setError("This domain is already declared in the workspace.");
      return;
    }

    const domain = createDomain(name);
    const next = [domain, ...domains];
    setDomains(next);
    writeStoredDomains(next);
    setInput("");
    navigate(`/console/domains/${domain.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <label className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          Add sending domain
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addDomain();
            }}
            placeholder="mail.example.com"
            className={`${FIELD} flex-1`}
          />
          <button type="button" onClick={addDomain} className={BTN_PRIMARY}>
            Add Domain
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <p className="mt-3 text-xs text-neutral-500">
          DNS provider is detected automatically from the domain nameservers
          (Cloudflare, OVH, Route 53…).
        </p>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Workspace domains · {domains.length}
          </p>
        </div>
        <ul className="divide-y divide-neutral-200">
          {domains.length === 0 ? (
            <li className="px-5 py-10 text-sm text-neutral-500">
              No domains yet. Add your first sending identity.
            </li>
          ) : (
            domains.map((domain) => (
              <li key={domain.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/console/domains/${domain.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#0A4BD6]/5"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm text-neutral-900">
                      {domain.name}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-neutral-400">
                      DNS · {domain.provider} · DKIM {domain.dkimStatus}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={domain.status} />
                    <ChevronRight
                      className="size-4 text-neutral-400"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConsoleDomain["status"] }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
        <Check className="size-3" aria-hidden="true" />
        verified
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-neutral-200/70 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
      {status}
    </span>
  );
}

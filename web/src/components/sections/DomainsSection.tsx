import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import PixelAccents from "../ui/PixelAccents";
import { ScanLoading } from "../ui/ScanLoading";
import SectionHeader from "../ui/SectionHeader";
import SplitPillButton from "../ui/SplitPillButton";

type DnsRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: string;
};

type VerifyState = "idle" | "verifying" | "verified";

const DOMAIN_PATTERN =
  /^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function buildRecords(domain: string): DnsRecord[] {
  const tokens = ["n3x7a1", "k8m2c4", "p5r9d0"];
  return [
    ...tokens.map((token) => ({
      type: "CNAME" as const,
      name: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`,
      purpose: "DKIM",
    })),
    {
      type: "TXT",
      name: domain,
      value: "v=spf1 include:amazonses.com ~all",
      purpose: "SPF",
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none;",
      purpose: "DMARC",
    },
  ];
}

export default function DomainsSection() {
  const [input, setInput] = useState("mail.acme.io");
  const [domain, setDomain] = useState("mail.acme.io");
  const [status, setStatus] = useState<VerifyState>("verified");
  const [copied, setCopied] = useState<string | null>(null);
  const records = useMemo(() => buildRecords(domain), [domain]);

  function addDomain() {
    const next = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!DOMAIN_PATTERN.test(next)) {
      return;
    }
    setDomain(next);
    setStatus("verifying");
    window.setTimeout(() => setStatus("verified"), 2400);
  }

  async function copyRecord(record: DnsRecord) {
    const payload = `${record.type} ${record.name} ${record.value}`;
    await navigator.clipboard.writeText(payload);
    setCopied(record.name);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section id="domains" className="relative scroll-mt-8 overflow-hidden bg-[#0A4BD6] pt-32 pb-20 text-white md:pt-40 md:pb-28">
      <PixelAccents variant={0} />
      <div className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-12 px-5 md:px-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeader
            tone="dark"
            kicker="DOMAIN ORCHESTRATION"
            title="Zero-Maintenance DNS. Instant Authenticated Delivery."
            description="Declare a sending domain, copy Easy DKIM CNAMEs plus SPF and DMARC, then Envoy polls SES until the identity is live."
          />
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-sm border border-white/10 bg-white/5 p-5 backdrop-blur-sm md:p-7">
            <label className="mb-2 block font-mono text-[11px] tracking-widest text-white/45 uppercase">
              Add sending domain
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    addDomain();
                  }
                }}
                placeholder="example.com"
                className="h-12 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 focus:ring-2 focus:ring-white/20"
              />
              <SplitPillButton label="Add Domain" onClick={addDomain} />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-mono text-xs tracking-wide text-white/50">
                Identity · {domain}
              </p>
              {status === "verifying" ? (
                <ScanLoading tone="onDark" className="font-mono text-[11px] tracking-wide">
                  Verifying DKIM…
                </ScanLoading>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-400/15 px-3 py-1 font-mono text-[11px] tracking-wide text-emerald-200">
                  <Check className="size-3" aria-hidden="true" />
                  DKIM SUCCESS
                </span>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[11px] tracking-widest text-white/40 uppercase">
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Value</th>
                    <th className="py-2 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.name} className="border-b border-white/10">
                      <td className="py-3 pr-3">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white">
                          {record.type}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate py-3 pr-3 font-mono text-xs text-white/80">
                        {record.name}
                      </td>
                      <td className="max-w-[240px] truncate py-3 pr-3 font-mono text-xs text-white/50">
                        {record.value}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void copyRecord(record)}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-3 py-1 text-xs font-medium text-white/80 hover:border-white/40 hover:text-white"
                        >
                          {copied === record.name ? (
                            <Check className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3.5" aria-hidden="true" />
                          )}
                          {copied === record.name ? "Copied" : "Copy Record"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import PixelAccents from "../ui/PixelAccents";
import SectionHeader from "../ui/SectionHeader";
import SplitPillButton from "../ui/SplitPillButton";

type DnsRecord = {
  type: "TXT";
  name: string;
  value: string;
  purpose: string;
};

const DOMAIN_PATTERN =
  /^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function buildRecords(domain: string): DnsRecord[] {
  return [
    {
      type: "TXT",
      name: `envoy._domainkey.${domain}`,
      value: "v=DKIM1; k=rsa; p=<public key generated for this domain>",
      purpose: "DKIM",
    },
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
  const [input, setInput] = useState("mail.example.com");
  const [domain, setDomain] = useState("mail.example.com");
  const [copied, setCopied] = useState<string | null>(null);
  const records = useMemo(() => buildRecords(domain), [domain]);

  function addDomain() {
    const next = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!DOMAIN_PATTERN.test(next)) {
      return;
    }
    setDomain(next);
  }

  async function copyRecord(record: DnsRecord) {
    const payload = `${record.type} ${record.name} ${record.value}`;
    await navigator.clipboard.writeText(payload);
    setCopied(record.name);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section id="domains" className="relative scroll-mt-8 overflow-hidden bg-[#0A4BD6] pt-16 pb-14 text-white md:pt-40 md:pb-28">
      <PixelAccents variant={0} />
      <div className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-8 px-4 sm:gap-12 sm:px-5 md:px-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeader
            tone="dark"
            kicker="DOMAINS"
            title="Sending domains"
            description="Adding a domain creates an Amazon SES identity with its own DKIM key. Envoy lists the DKIM, SPF and DMARC records to publish at the DNS host, then reads the verification status from SES."
          />
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-sm border border-white/10 bg-[#0839B0]/70 p-5 md:p-7">
            <label
              htmlFor="landing-domain"
              className="mb-2 block font-mono text-[11px] tracking-widest text-white/80 uppercase"
            >
              Domain
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="landing-domain"
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
              <SplitPillButton label="Show records" onClick={addDomain} />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-mono text-xs tracking-wide text-white/80">
                Example · {domain}
              </p>
              <span className="inline-flex items-center rounded-sm border border-white/20 bg-white/10 px-3 py-1 font-mono text-[11px] tracking-wide text-white">
                Records to publish
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[11px] tracking-widest text-white/80 uppercase">
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Value</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Action</span>
                    </th>
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
                      <td className="max-w-[240px] truncate py-3 pr-3 font-mono text-xs text-white/80">
                        {record.value}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void copyRecord(record)}
                          aria-label={`Copy ${record.purpose} record`}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-3 py-1 text-xs font-medium text-white/80 hover:border-white/40 hover:text-white"
                        >
                          {copied === record.name ? (
                            <Check className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3.5" aria-hidden="true" />
                          )}
                          {copied === record.name ? "Copied" : "Copy"}
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

import { Shield } from "lucide-react";
import { useEffect, useState } from "react";

import PixelAccents from "../ui/PixelAccents";
import SectionHeader from "../ui/SectionHeader";

type EventStatus = "Delivered" | "Bounced" | "Suppressed" | "Complaint";

type LogRow = {
  id: string;
  at: string;
  recipient: string;
  event: EventStatus;
  latency: string;
};

const STATUS_STYLES: Record<EventStatus, string> = {
  Delivered: "bg-emerald-400/15 text-emerald-200",
  Bounced: "bg-red-400/15 text-red-200",
  Suppressed: "bg-orange-400/15 text-orange-200",
  Complaint: "bg-violet-400/15 text-violet-200",
};

const SEED: LogRow[] = [
  { id: "msg_8f21", at: "03:41:02.018", recipient: "ops@northwind.io", event: "Delivered", latency: "47ms" },
  { id: "msg_8f20", at: "03:41:01.902", recipient: "billing@helix.dev", event: "Delivered", latency: "52ms" },
  { id: "msg_8f19", at: "03:40:58.441", recipient: "gone@oldmail.tld", event: "Bounced", latency: "61ms" },
  { id: "msg_8f18", at: "03:40:54.110", recipient: "abuse@trap.example", event: "Suppressed", latency: "12ms" },
];

const POOL: Array<Pick<LogRow, "recipient" | "event" | "latency">> = [
  { recipient: "hello@flowen.agency", event: "Delivered", latency: "44ms" },
  { recipient: "support@openrich.app", event: "Delivered", latency: "39ms" },
  { recipient: "noreply-bounce@isp.net", event: "Bounced", latency: "73ms" },
  { recipient: "spam-report@mailbox.com", event: "Complaint", latency: "58ms" },
  { recipient: "blocked@suppression.list", event: "Suppressed", latency: "9ms" },
];

const SUPPRESSED = [
  { email: "gone@oldmail.tld", reason: "Hard bounce" },
  { email: "abuse@trap.example", reason: "Complaint" },
  { email: "blocked@suppression.list", reason: "Hard bounce" },
];

function stamp(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":") + `.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

export default function LogsSection() {
  const [rows, setRows] = useState<LogRow[]>(SEED);
  const [showSuppression, setShowSuppression] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = POOL[Math.floor(Math.random() * POOL.length)];
      setRows((current) => [
        {
          id: `msg_${Math.random().toString(36).slice(2, 7)}`,
          at: stamp(),
          ...next,
        },
        ...current.slice(0, 6),
      ]);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="logs" className="relative scroll-mt-8 overflow-hidden bg-[#0A4BD6] py-20 text-white md:py-28">
      <PixelAccents variant={2} />
      <div className="relative z-10 mx-auto w-full max-w-[92rem] px-5 md:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeader
              tone="dark"
              kicker="AUDIT TRAIL & REPUTATION"
              title="Sub-80ms API Responses with Instant Event Tracking."
              description="The send endpoint returns a messageId immediately. SES delivery, hard bounces and complaints stream in through SNS and feed the global suppression list."
            />
            <label className="mt-8 inline-flex cursor-pointer items-center gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={showSuppression}
                onChange={(event) => setShowSuppression(event.target.checked)}
                className="size-4 accent-white"
              />
              Show suppression list
            </label>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-sm border border-white/10 bg-white/5 p-5 backdrop-blur-sm md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-mono text-[11px] tracking-widest text-white/40 uppercase">
                  Live event console
                </p>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-emerald-200">
                  <span className="envoy-live-dot size-1.5 rounded-full bg-emerald-400" />
                  STREAMING
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 font-mono text-[11px] tracking-widest text-white/40 uppercase">
                      <th className="py-2 font-medium">Time</th>
                      <th className="py-2 font-medium">Recipient</th>
                      <th className="py-2 font-medium">Event</th>
                      <th className="py-2 font-medium">API</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-white/10">
                        <td className="py-3 font-mono text-xs text-white/50">{row.at}</td>
                        <td className="py-3 font-mono text-xs text-white/80">{row.recipient}</td>
                        <td className="py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[row.event]}`}
                          >
                            {row.event}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-xs text-white/50">{row.latency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showSuppression ? (
              <div className="mt-4 rounded-sm border border-orange-300/30 bg-white/5 p-5">
                <p className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-orange-200 uppercase">
                  <Shield className="size-3.5" aria-hidden="true" />
                  Suppression list
                </p>
                <ul className="space-y-2">
                  {SUPPRESSED.map((entry) => (
                    <li
                      key={entry.email}
                      className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-sm last:border-0"
                    >
                      <span className="font-mono text-xs text-white/80">{entry.email}</span>
                      <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[11px] text-orange-200">
                        {entry.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

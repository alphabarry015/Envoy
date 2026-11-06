import { Shield } from "lucide-react";
import { useState } from "react";

import PixelAccents from "../ui/PixelAccents";
import SectionHeader from "../ui/SectionHeader";

type EventStatus = "Delivered" | "Bounced" | "Suppressed" | "Complaint";

type LogRow = {
  id: string;
  at: string;
  recipient: string;
  event: EventStatus;
};

const STATUS_STYLES: Record<EventStatus, string> = {
  Delivered: "bg-emerald-400/15 text-emerald-200",
  Bounced: "bg-red-400/15 text-red-200",
  Suppressed: "bg-orange-400/15 text-orange-200",
  Complaint: "bg-violet-400/15 text-violet-200",
};

const ROWS: LogRow[] = [
  { id: "msg_8f21", at: "03:41:02", recipient: "ops@northwind.example", event: "Delivered" },
  { id: "msg_8f20", at: "03:41:01", recipient: "billing@helix.example", event: "Delivered" },
  { id: "msg_8f19", at: "03:40:58", recipient: "gone@oldmail.example", event: "Bounced" },
  { id: "msg_8f18", at: "03:40:54", recipient: "abuse@trap.example", event: "Suppressed" },
  { id: "msg_8f17", at: "03:40:49", recipient: "report@mailbox.example", event: "Complaint" },
];

const SUPPRESSED = [
  { email: "gone@oldmail.example", reason: "Hard bounce" },
  { email: "abuse@trap.example", reason: "Complaint" },
  { email: "report@mailbox.example", reason: "Complaint" },
];

export default function LogsSection() {
  const [showSuppression, setShowSuppression] = useState(true);

  return (
    <section id="logs" className="relative scroll-mt-8 overflow-hidden bg-[#0A4BD6] py-14 text-white md:py-28">
      <PixelAccents variant={2} />
      <div className="relative z-10 mx-auto w-full max-w-[92rem] px-4 sm:px-5 md:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeader
              tone="dark"
              kicker="EVENTS"
              title="Delivery events and suppression list"
              description="The send endpoint returns a message ID and queues the message. Amazon SES reports deliveries, bounces and complaints through SNS. Envoy records each event in the logs, and adds hard-bounced or complaining addresses to the suppression list so they are skipped on later sends."
            />
            <label className="mt-8 inline-flex cursor-pointer items-center gap-3 text-sm text-white/80">
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
            <div className="rounded-sm border border-white/10 bg-[#0839B0]/70 p-5 md:p-6">
              <p className="mb-4 font-mono text-[11px] tracking-widest text-white/80 uppercase">
                Example event log
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 font-mono text-[11px] tracking-widest text-white/80 uppercase">
                      <th className="py-2 font-medium">Time</th>
                      <th className="py-2 font-medium">Recipient</th>
                      <th className="py-2 font-medium">Event</th>
                      <th className="py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.id} className="border-b border-white/10">
                        <td className="py-3 font-mono text-xs text-white/80">{row.at}</td>
                        <td className="py-3 font-mono text-xs text-white/80">{row.recipient}</td>
                        <td className="py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[row.event]}`}
                          >
                            {row.event}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-xs text-white/80">{row.id}</td>
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

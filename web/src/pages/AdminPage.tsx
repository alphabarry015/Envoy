const STATS = [
  { label: "Sends today", value: "1,240", hint: "/ 5,000 quota" },
  { label: "Domains live", value: "2", hint: "/ 5 allowed" },
  { label: "API keys", value: "1", hint: "active" },
  { label: "Bounce rate", value: "0.4%", hint: "last 7 days" },
];

const LOGS = [
  {
    id: "msg_8k2q",
    to: "ops@acme.io",
    subject: "Invoice 2048",
    event: "Delivery",
    at: "2m ago",
  },
  {
    id: "msg_7n1p",
    to: "hello@client.io",
    subject: "Password reset",
    event: "Delivery",
    at: "18m ago",
  },
  {
    id: "msg_6m0o",
    to: "bad@trap.test",
    subject: "Welcome",
    event: "Bounce",
    at: "1h ago",
  },
];

export function OverviewPanel() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-sm border border-neutral-200 bg-neutral-50 p-5"
          >
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              {stat.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{stat.hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          Recent activity
        </p>
        <ul className="mt-4 space-y-3">
          {LOGS.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 text-sm last:border-0 last:pb-0"
            >
              <span className="font-mono text-neutral-700">{row.id}</span>
              <span className="text-neutral-600">{row.subject}</span>
              <span className="text-neutral-400">{row.at}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

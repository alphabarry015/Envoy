import { BTN_PRIMARY } from "../lib/consoleUi";

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

const USERS = [
  {
    email: "admin@acme.io",
    role: "Admin",
    status: "active",
    domains: "5",
  },
  {
    email: "dev@acme.io",
    role: "Member",
    status: "active",
    domains: "2",
  },
  {
    email: "new@partner.io",
    role: "Member",
    status: "pending",
    domains: "1",
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

export function LogsPanel() {
  return (
    <div>
      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              <th className="px-5 py-3 font-medium">Message</th>
              <th className="px-5 py-3 font-medium">To</th>
              <th className="px-5 py-3 font-medium">Event</th>
              <th className="px-5 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {LOGS.map((row) => (
              <tr key={row.id} className="border-b border-neutral-200 last:border-0">
                <td className="px-5 py-4 font-mono text-xs text-neutral-700">{row.id}</td>
                <td className="px-5 py-4 text-neutral-700">{row.to}</td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${
                      row.event === "Bounce"
                        ? "bg-orange-50 text-orange-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.event}
                  </span>
                </td>
                <td className="px-5 py-4 text-neutral-400">{row.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UsersPanel() {
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        <button type="button" className={BTN_PRIMARY}>
          Invite user
        </button>
      </div>
      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Domain quota</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((user) => (
              <tr key={user.email} className="border-b border-neutral-200 last:border-0">
                <td className="px-5 py-4 text-neutral-800">{user.email}</td>
                <td className="px-5 py-4 text-neutral-500">{user.role}</td>
                <td className="px-5 py-4">
                  <span className="rounded-sm bg-neutral-200/70 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
                    {user.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-neutral-500">{user.domains}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SuppressionPanel() {
  return (
    <div>
      <div className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <ul className="space-y-3 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
            <span className="font-mono text-neutral-700">bad@trap.test</span>
            <span className="rounded-sm bg-orange-50 px-2 py-0.5 font-mono text-[11px] text-orange-700">
              Hard bounce
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-neutral-700">spam@report.io</span>
            <span className="rounded-sm bg-red-50 px-2 py-0.5 font-mono text-[11px] text-red-600">
              Complaint
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

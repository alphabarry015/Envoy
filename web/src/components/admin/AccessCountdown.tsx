import { Hourglass } from "lucide-react";
import { useEffect, useState } from "react";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatRemaining(ms: number): string {
  const left = Math.max(0, ms);
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  const seconds = Math.floor((left % MINUTE) / 1000);
  const clock = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Live countdown to the end of a member's access. Renders nothing when there is no end date. */
export default function AccessCountdown({
  expiresAt,
  onExpired,
  className = "",
}: {
  expiresAt: string | null;
  onExpired?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const end = expiresAt ? new Date(expiresAt).getTime() : null;
  const left = end === null ? null : end - now;

  useEffect(() => {
    if (end === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);

  const expired = left !== null && left <= 0;
  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);

  if (end === null || left === null) return null;

  const tone =
    left <= 0
      ? "border-red-200 bg-red-50 text-red-700"
      : left <= DAY
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-[#0A4BD6]/20 bg-[#0A4BD6]/5 text-[#0A4BD6]";

  return (
    <div
      role="timer"
      aria-live="off"
      title={`Access ends ${new Date(end).toLocaleString()}`}
      className={`inline-flex shrink-0 items-center gap-2 rounded-sm border px-3 py-1.5 ${tone} ${className}`}
    >
      <Hourglass className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[10px] tracking-widest uppercase opacity-70">
          {left <= 0 ? "Access expired" : "Access ends in"}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatRemaining(left)}
        </span>
      </span>
    </div>
  );
}

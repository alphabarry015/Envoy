import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { type ConsoleEmail, fetchEmail, formatSentAgo } from "../../lib/emails";
import { onRealtime } from "../../lib/realtime";
import { PageLoading } from "../ui/ScanLoading";
import { providerLabel } from "../../lib/providerOptions";
import { MailStatusBadge } from "./EmailsPanel";
import InviteBadge from "./InviteBadge";
import { MethodBadge, ProviderBadge } from "./LogsPanel";

export default function EmailDetailPage() {
  const { emailId = "" } = useParams();
  const [email, setEmail] = useState<ConsoleEmail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmail(emailId)
      .then((row) => {
        if (!cancelled) setEmail(row);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const unsubscribe = onRealtime(["emails.changed"], (message) => {
      if (message.data.email_id && message.data.email_id !== emailId) return;
      void fetchEmail(emailId)
        .then((row) => {
          if (!cancelled && row) setEmail(row);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [emailId]);

  if (loading) {
    return (
      <PageLoading>Loading email…</PageLoading>
    );
  }

  if (!email) {
    return <Navigate to="/console/emails" replace />;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/console/emails"
        className="inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-[#0A4BD6]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to emails
      </Link>

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              {email.method === "POST" ? "Sent" : "Received"}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-950 md:text-2xl">
              {email.subject}
              <InviteBadge kind={email.kind} />
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProviderBadge provider={email.provider} />
            <MethodBadge method={email.method} />
            <MailStatusBadge status={email.status} />
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-2">
          <Meta label="From" value={email.from} />
          <Meta label="To" value={email.to} />
          <Meta label="Tool" value={email.provider ? providerLabel(email.provider) : "—"} />
          <Meta label="Sent" value={formatSentAgo(email.sentAt)} />
          <Meta label="Status" value={email.status} />
        </dl>
      </section>

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-6">
        <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Message</p>
        <pre className="mt-4 overflow-auto rounded-sm border border-neutral-200 bg-white p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-neutral-950">
          {email.text}
        </pre>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{label}</dt>
      <dd className="mt-1.5 text-sm text-neutral-800">{value}</dd>
    </div>
  );
}

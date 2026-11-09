import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { apiBase } from "../../lib/apiBase";
import { authHeader, readSession, replaceAccessToken, signOut, signOutEverywhere } from "../../lib/auth";
import { BTN_PRIMARY, FIELD_COMPACT, KICKER } from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";

type Account = {
  email: string;
  display_name?: string | null;
  role?: string;
  invite_reply_to?: string | null;
};

type PasswordForm = {
  current: string;
  next: string;
  confirm: string;
};

const EMPTY_FORM: PasswordForm = { current: "", next: "", confirm: "" };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { msg?: string };
      if (typeof first.msg === "string") return first.msg;
    }
  } catch {
    /* réponse non JSON */
  }
  return "Could not update the password.";
}

function signedInLabel(value: string | undefined): string {
  if (!value) return "This browser";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "This browser";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const session = readSession();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<PasswordForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [inviteReplyTo, setInviteReplyTo] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = apiBase();
    fetch(`${baseUrl}/api/v1/auth/me`, { headers: authHeader() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load settings.");
        return (await response.json()) as Account;
      })
      .then((body) => {
        if (!cancelled) {
          setAccount(body);
          setInviteReplyTo(body.invite_reply_to ?? "");
          setDisplayName(body.display_name ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    if (form.next !== form.confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const baseUrl = apiBase();
      const response = await fetch(`${baseUrl}/api/v1/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          current_password: form.current,
          new_password: form.next,
          new_password_confirm: form.confirm,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { access_token?: string };
      if (body.access_token) replaceAccessToken(body.access_token);
      setForm(EMPTY_FORM);
      setSaved(true);
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Could not update the password.");
    } finally {
      setSaving(false);
    }
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setNameSaving(true);
    setNameMessage(null);
    try {
      const response = await fetch(`${apiBase()}/api/v1/auth/me/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as Account;
      setAccount(body);
      setDisplayName(body.display_name ?? "");
      setNameMessage({ ok: true, text: "Name saved." });
    } catch (cause: unknown) {
      setNameMessage({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save your name.",
      });
    } finally {
      setNameSaving(false);
    }
  }

  async function submitInviteSettings(event: FormEvent) {
    event.preventDefault();
    setInviteSaving(true);
    setInviteMessage(null);
    try {
      const response = await fetch(`${apiBase()}/api/v1/auth/me/invite-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ invite_reply_to: inviteReplyTo.trim() || null }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as Account;
      setAccount(body);
      setInviteReplyTo(body.invite_reply_to ?? "");
      setInviteMessage({
        ok: true,
        text: body.invite_reply_to
          ? `Replies to invitations now go to ${body.invite_reply_to}.`
          : "Invitations are sent without a reply address.",
      });
    } catch (cause: unknown) {
      setInviteMessage({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the reply address.",
      });
    } finally {
      setInviteSaving(false);
    }
  }

  function logout() {
    signOut();
    navigate("/console/login", { replace: true });
  }

  async function logoutEverywhere() {
    await signOutEverywhere();
    navigate("/console/login", { replace: true });
  }

  if (!account) {
    return (
      <div>
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {loadError ? null : (
          <PageLoading>Loading…</PageLoading>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className={KICKER}>Profile</p>
        <p className="mt-3 text-sm text-neutral-500">
          Your name appears in the invitations you send. Your email address is never shown.
        </p>
        <form className="mt-5 space-y-3" onSubmit={submitProfile}>
          <label className="block">
            <span className="mb-1.5 block text-xs text-neutral-500">Your name</span>
            <input
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              className={FIELD_COMPACT}
            />
          </label>
          {nameMessage ? (
            <p className={`text-sm ${nameMessage.ok ? "text-emerald-700" : "text-red-600"}`}>
              {nameMessage.text}
            </p>
          ) : null}
          <button type="submit" className={BTN_PRIMARY} disabled={nameSaving}>
            {nameSaving ? "Saving…" : "Save name"}
          </button>
        </form>
      </section>

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className={KICKER}>Password</p>
        <p className="mt-3 text-sm text-neutral-500">
          Signed in as <span className="font-medium text-neutral-950">{account.email}</span>. Use at least 10
          characters.
        </p>
        <form className="mt-5 space-y-3" onSubmit={submitPassword}>
          <label className="block">
            <span className="mb-1.5 block text-xs text-neutral-500">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={form.current}
              onChange={(event) => setForm((current) => ({ ...current, current: event.target.value }))}
              className={FIELD_COMPACT}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-neutral-500">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={form.next}
              onChange={(event) => setForm((current) => ({ ...current, next: event.target.value }))}
              className={FIELD_COMPACT}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-neutral-500">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={form.confirm}
              onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
              className={FIELD_COMPACT}
            />
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {saved ? (
            <p className="text-sm text-emerald-700">Password updated. Other devices were signed out.</p>
          ) : null}
          <button type="submit" className={BTN_PRIMARY} disabled={saving}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      {account.role === "admin" ? (
        <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
          <p className={KICKER}>Invitation emails</p>
          <p className="mt-3 text-sm text-neutral-500">
            When someone answers an invitation you send, the reply goes to this address. Leave it
            empty to send invitations without a reply address. Only admins see this setting.
          </p>
          <form className="mt-5 space-y-3" onSubmit={submitInviteSettings}>
            <label className="block">
              <span className="mb-1.5 block text-xs text-neutral-500">Reply-to address</span>
              <input
                type="email"
                value={inviteReplyTo}
                onChange={(event) => setInviteReplyTo(event.target.value)}
                placeholder={account.email}
                autoComplete="email"
                className={FIELD_COMPACT}
              />
            </label>
            {inviteMessage ? (
              <p className={`text-sm ${inviteMessage.ok ? "text-emerald-700" : "text-red-600"}`}>
                {inviteMessage.text}
              </p>
            ) : null}
            <button type="submit" className={BTN_PRIMARY} disabled={inviteSaving}>
              {inviteSaving ? "Saving…" : "Save reply address"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-sm border border-neutral-200 bg-neutral-50 p-5 md:p-7">
        <p className={KICKER}>Session</p>
        <dl className="mt-5 divide-y divide-neutral-200">
          <div className="flex flex-wrap items-baseline justify-between gap-3 py-3">
            <dt className="text-sm text-neutral-500">Browser</dt>
            <dd className="text-sm font-medium text-neutral-950">This device</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-3 py-3">
            <dt className="text-sm text-neutral-500">Signed in</dt>
            <dd className="text-sm font-medium text-neutral-950">{signedInLabel(session?.signedInAt)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={logout}
          className="mt-4 inline-flex items-center rounded-sm border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => void logoutEverywhere()}
          className="mt-4 ml-2 inline-flex items-center rounded-sm border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Sign out of all devices
        </button>
      </section>
    </div>
  );
}

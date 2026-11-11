import { Check, Copy, MoreVertical, UserPlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import {
  DAILY_QUOTA_OPTIONS,
  MONTHLY_QUOTA_OPTIONS,
  formatQuota,
} from "../../lib/apiKeys";
import {
  type AccessRequestItem,
  acceptAccessRequest,
  declineAccessRequest,
  fetchAccessRequests,
} from "../../lib/accessRequests";
import { readSession } from "../../lib/auth";
import { accountInitials, displayNameOf } from "../../lib/account";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import {
  PROVIDER_OPTIONS,
  type ProviderId,
  providerLabel,
} from "../../lib/providerOptions";
import { fetchProviders } from "../../lib/providers";
import { onRealtime } from "../../lib/realtime";
import { PageLoading } from "../ui/ScanLoading";
import AccessRequestsSection from "./AccessRequestsSection";
import {
  type ConsoleUser,
  type IssuedInvite,
  type UserRole,
  type UserStatus,
  DOMAIN_QUOTA_OPTIONS,
  accessExpired,
  deliveryFailures,
  fetchUsers,
  deleteSuspendedUser,
  revokeUserInvite,
  sendInvite as issueInvite,
  setUserStatus,
  updateUser,
} from "../../lib/users";

const SELECT =
  "h-11 w-full appearance-none rounded-sm border border-neutral-200 bg-neutral-50 bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-4 pr-10 text-sm text-neutral-950 outline-none focus:border-[#0A4BD6] focus:bg-white focus:ring-2 focus:ring-[#0A4BD6]/20";

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MENU_WIDTH = 168;

type FormState = {
  name: string;
  email: string;
  role: UserRole;
  domainQuota: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  apiKeysEnabled: boolean;
  expiresInHours: 24 | 48;
  expiresOther: boolean;
  expiresNever: boolean;
  expiresDays: number;
  /** Edit mode only: end of an active member's access. */
  accessChoice: AccessChoice;
  provider: ProviderId;
};

type AccessChoice = "keep" | "7" | "30" | "90" | "other" | "never";

function accessExpiryFrom(form: FormState): string | null | undefined {
  if (form.accessChoice === "keep") return undefined;
  if (form.accessChoice === "never") return null;
  const days =
    form.accessChoice === "other"
      ? Math.trunc(form.expiresDays)
      : Number(form.accessChoice);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function emptyForm(provider: ProviderId = "ses"): FormState {
  return {
    name: "",
    email: "",
    role: "member",
    domainQuota: 1,
    dailyQuota: 1_000,
    monthlyQuota: 10_000,
    apiKeysEnabled: true,
    expiresInHours: 48,
    expiresOther: false,
    expiresNever: false,
    expiresDays: 7,
    accessChoice: "keep",
    provider,
  };
}

function formFromUser(
  user: ConsoleUser,
  provider: ProviderId = "ses",
): FormState {
  return {
    name: user.name ?? "",
    email: user.email,
    role: user.role,
    domainQuota: user.domainQuota,
    dailyQuota: user.dailyQuota,
    monthlyQuota: user.monthlyQuota,
    apiKeysEnabled: user.apiKeysEnabled,
    expiresInHours: 48,
    expiresOther: false,
    expiresNever: false,
    expiresDays: 30,
    accessChoice: "keep",
    provider,
  };
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function UsersPanel() {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sessionEmail = readSession()?.email ?? "";
  const [users, setUsers] = useState<ConsoleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [connectedTools, setConnectedTools] = useState<ProviderId[]>(
    PROVIDER_OPTIONS.map((item) => item.id),
  );
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>("ses");
  const [form, setForm] = useState<FormState>(() => emptyForm("ses"));
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [fromRequest, setFromRequest] = useState<AccessRequestItem | null>(
    null,
  );
  const [searchParams] = useSearchParams();
  const highlightRequestId = searchParams.get("request");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const seats = users.filter((user) => user.email !== sessionEmail);
  const editing = seats.find((user) => user.id === editingId) ?? null;
  const nameLocked = Boolean(editing) || Boolean(fromRequest);
  const menuUser = seats.find((user) => user.id === menuId) ?? null;
  const pendingCount = seats.filter((user) => user.status === "pending").length;

  async function reloadRequests() {
    try {
      setRequests(await fetchAccessRequests());
      setRequestsError(null);
    } catch (cause: unknown) {
      setRequestsError(
        cause instanceof Error
          ? cause.message
          : "Could not load access requests.",
      );
    }
  }

  async function reload() {
    setLoadError(null);
    void reloadRequests();
    try {
      const [nextUsers, providers] = await Promise.all([
        fetchUsers(),
        fetchProviders(),
      ]);
      setUsers(nextUsers);
      const ready = PROVIDER_OPTIONS.map((item) => item.id).filter((id) => {
        const row = providers.items.find((item) => item.id === id);
        return Boolean(row?.connected && row.enabled);
      });
      const tools = ready.length > 0 ? ready : (["ses"] as ProviderId[]);
      setConnectedTools(tools);
      const preferred =
        (providers.effective_order.find((id) =>
          tools.includes(id as ProviderId),
        ) as ProviderId | undefined) ?? tools[0];
      setDefaultProvider(preferred);
    } catch (cause: unknown) {
      setLoadError(
        cause instanceof Error ? cause.message : "Could not load users.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const offUsers = onRealtime(["users.changed"], () => {
      void reload();
    });
    const offRequests = onRealtime(["access_requests.changed"], () => {
      void reloadRequests();
    });
    return () => {
      offUsers();
      offRequests();
    };
  }, []);

  function closeMenu() {
    setMenuId(null);
    setConfirmDeleteId(null);
    setMenuPos(null);
  }

  function openMenu(id: string) {
    if (menuId === id) {
      closeMenu();
      return;
    }
    const trigger = triggerRefs.current[id];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - MENU_WIDTH),
    });
    setMenuId(id);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setIssued(null);
    setFromRequest(null);
    setError(null);
    setForm(emptyForm(defaultProvider));
  }

  function openFromRequest(item: AccessRequestItem) {
    closeMenu();
    setForm({
      ...emptyForm(defaultProvider),
      name: item.fullName,
      email: item.email,
    });
    setEditingId(null);
    setIssued(null);
    setError(null);
    setFromRequest(item);
    setModalOpen(true);
  }

  async function declineRequest(item: AccessRequestItem, notify: boolean) {
    setRequestsError(null);
    try {
      await declineAccessRequest(item.id, notify);
      await reloadRequests();
    } catch (cause: unknown) {
      setRequestsError(
        cause instanceof Error
          ? cause.message
          : "Could not decline this request.",
      );
    }
  }

  function openInvite() {
    closeMenu();
    setForm(emptyForm(defaultProvider));
    setEditingId(null);
    setIssued(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(user: ConsoleUser) {
    closeMenu();
    setForm(formFromUser(user, defaultProvider));
    setEditingId(user.id);
    setIssued(null);
    setError(null);
    setModalOpen(true);
  }

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!issued && !editingId) {
      window.setTimeout(() => nameRef.current?.focus(), 0);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen, issued, editingId]);

  useEffect(() => {
    if (!menuId) return;
    const openId = menuId;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRefs.current[openId]?.contains(target)) return;
      closeMenu();
    }
    function onDismiss() {
      closeMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [menuId]);

  async function sendInvite() {
    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();
    setError(null);
    if (!name) {
      setError("Enter the person's name.");
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid work email.");
      return;
    }
    if (!form.provider) {
      setError("Choose a sending tool for the invite email.");
      return;
    }
    const days = Math.trunc(form.expiresDays);
    if (
      form.expiresOther &&
      (!Number.isInteger(days) || days < 1 || days > 365)
    ) {
      setError("Enter a number of days between 1 and 365.");
      return;
    }
    setSaving(true);
    try {
      const draft = {
        ...form,
        name,
        email,
        provider: form.provider,
        expiresInHours: form.expiresOther ? days * 24 : form.expiresInHours,
        neverExpires: form.expiresNever,
      };
      const issuedInvite = fromRequest
        ? await acceptAccessRequest(fromRequest.id, draft)
        : await issueInvite(draft);
      await reload();
      setIssued({ ...issuedInvite, requestedWith: providerLabel(form.provider) });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Could not send the invite.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);
    const days = Math.trunc(form.expiresDays);
    if (
      form.accessChoice === "other" &&
      (!Number.isInteger(days) || days < 1 || days > 3650)
    ) {
      setError("Enter a number of days between 1 and 3650.");
      return;
    }
    setSaving(true);
    try {
      await updateUser(
        editing,
        { ...form, email: editing.email },
        accessExpiryFrom(form),
      );
      await reload();
      closeModal();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this user.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user: ConsoleUser, status: UserStatus) {
    closeMenu();
    setLoadError(null);
    try {
      await setUserStatus(user, status);
      await reload();
    } catch (cause: unknown) {
      setLoadError(
        cause instanceof Error ? cause.message : "Could not update this user.",
      );
    }
  }

  async function deleteUser(id: string) {
    closeMenu();
    setLoadError(null);
    try {
      await deleteSuspendedUser(id);
      await reload();
    } catch (cause: unknown) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not delete this account.",
      );
    }
  }

  async function revokeInvite(id: string) {
    closeMenu();
    setLoadError(null);
    try {
      await revokeUserInvite(id);
      await reload();
    } catch (cause: unknown) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not revoke this invite.",
      );
    }
  }

  if (loading) {
    return <PageLoading>Loading…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Seats are invite-only. Envoy emails a one-time activation link.
        </p>
        <button type="button" onClick={openInvite} className={BTN_PRIMARY}>
          <UserPlus className="size-3.5" aria-hidden="true" />
          Invite user
        </button>
      </div>

      <AccessRequestsSection
        requests={requests}
        highlightId={highlightRequestId}
        error={requestsError}
        onAccept={openFromRequest}
        onDecline={declineRequest}
      />

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Workspace seats · {seats.length} · {pendingCount} pending
          </p>
        </div>
        {loadError ? (
          <p className="px-5 py-4 text-sm text-red-600">{loadError}</p>
        ) : null}
        {seats.length === 0 && !loadError ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <UserPlus className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              No seats yet. Invite the first member.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[20%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-2.5 font-medium">Member</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Domains</th>
                  <th className="px-5 py-2.5 font-medium">Sends</th>
                  <th className="px-5 py-2.5 font-medium">Keys</th>
                  <th className="px-5 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {seats.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-neutral-200 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-[#0A4BD6] text-[11px] font-semibold tracking-wide text-white"
                          aria-hidden="true"
                        >
                          {accountInitials(
                            displayNameOf(user.email, user.name),
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-950">
                            {displayNameOf(user.email, user.name)}
                          </span>
                          <span className="block truncate text-neutral-500">
                            {user.email}
                          </span>
                          {user.status === "pending" ? (
                            <span className="mt-1 block font-mono text-[11px] text-neutral-400">
                              {user.expiresAt
                                ? `Expires ${formatWhen(user.expiresAt)}`
                                : "Never expires"}
                            </span>
                          ) : null}
                          {user.status === "active" && user.accessExpiresAt ? (
                            <span
                              className={`mt-1 block font-mono text-[11px] ${accessExpired(user) ? "text-red-600" : "text-neutral-400"}`}
                            >
                              {accessExpired(user)
                                ? `Access expired ${formatWhen(user.accessExpiresAt)}`
                                : `Access until ${formatWhen(user.accessExpiresAt)}`}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-600">
                      {user.role}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-600">
                      {formatQuota(user.domainQuota)}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-neutral-500">
                      {formatQuota(user.dailyQuota)}/d ·{" "}
                      {formatQuota(user.monthlyQuota)}/mo
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-600">
                      {user.apiKeysEnabled ? "On" : "Off"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        ref={(node) => {
                          triggerRefs.current[user.id] = node;
                        }}
                        aria-haspopup="menu"
                        aria-expanded={menuId === user.id}
                        aria-label={`${user.email} actions`}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-600 transition-colors hover:border-[#0A4BD6]/40 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                        onClick={() => openMenu(user.id)}
                      >
                        <MoreVertical className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      {issued
                        ? issued.emailSent
                          ? "Invitation sent"
                          : "Invitation created"
                        : editing
                          ? "Access"
                          : fromRequest
                            ? "Access request"
                            : "Invitation"}
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      {issued
                        ? issued.emailSent
                          ? `${issued.email} is on the way`
                          : "Share the invitation yourself"
                        : editing
                          ? "Update access"
                          : fromRequest
                            ? `Accept ${fromRequest.fullName}`
                            : "Invite a user"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {issued
                        ? issued.emailSent
                          ? `Sent with ${issued.sentWith ?? "your sending tool"}.`
                          : `The email to ${issued.email} could not be delivered.`
                        : fromRequest
                          ? "Pick their access. Envoy then sends the invitation."
                          : "Domain cap, send quotas, and API key access."}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={closeModal}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                {issued ? (
                  <div className="space-y-5 p-6">
                    {issued.emailSent ? (
                      <p className="text-sm leading-relaxed text-neutral-600">
                        {issued.email} gets an email with a button to accept the
                        invitation and a code to type on the sign-in page. They
                        choose a password and land in the console. Nothing else
                        to do on your side.
                      </p>
                    ) : (
                      <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
                        <p className="font-medium">
                          None of your sending tools could deliver the email.
                        </p>
                        <p className="mt-1">
                          The seat is reserved. Send the code or the link below
                          to {issued.email} yourself, for example over Slack.
                        </p>
                      </div>
                    )}
                    {issued.emailSent &&
                    issued.requestedWith &&
                    issued.sentWith &&
                    issued.sentWith !== issued.requestedWith ? (
                      <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
                        <p className="font-medium">
                          {issued.requestedWith} was skipped — sent with{" "}
                          {issued.sentWith} instead.
                        </p>
                        {deliveryFailures(issued.emailError)
                          .filter((item) => item.tool === issued.requestedWith)
                          .map((item) => (
                            <p key={item.reason} className="mt-1 break-words">
                              Reason: {item.reason}
                            </p>
                          ))}
                      </div>
                    ) : null}
                    {deliveryFailures(issued.emailError).filter(
                      (item) =>
                        !issued.emailSent || item.tool !== issued.requestedWith,
                    ).length > 0 ? (
                      <div className="text-xs leading-relaxed text-neutral-500">
                        <p>
                          {issued.emailSent
                            ? "Other tools skipped:"
                            : "Why each tool failed:"}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {deliveryFailures(issued.emailError)
                            .filter(
                              (item) =>
                                !issued.emailSent ||
                                item.tool !== issued.requestedWith,
                            )
                            .map((item) => (
                              <li
                                key={`${item.tool}:${item.reason}`}
                                className="break-words"
                              >
                                {item.tool ? (
                                  <span className="font-medium text-neutral-700">
                                    {item.tool}:
                                  </span>
                                ) : null}{" "}
                                {item.reason}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                    <CopyRow
                      label="Invitation code"
                      value={issued.code}
                      large
                    />
                    <CopyRow label="Activation link" value={issued.link} />
                    <p className="text-xs leading-relaxed text-neutral-500">
                      Works once.{" "}
                      {issued.expiresAt
                        ? `Expires on ${new Date(issued.expiresAt).toLocaleString()}.`
                        : "Never expires — revoke it to cancel."}{" "}
                      The code
                      goes in "Have an invitation code?" on the console sign-in
                      page.
                    </p>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        onClick={closeModal}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                      <label className="block">
                        <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Name
                        </span>
                        <input
                          ref={nameRef}
                          value={form.name}
                          readOnly={nameLocked}
                          aria-readonly={nameLocked}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder={editing ? "No name yet" : "Ada Lovelace"}
                          autoComplete="name"
                          className={`${FIELD_COMPACT} read-only:cursor-not-allowed read-only:bg-neutral-100 read-only:text-neutral-500`}
                        />
                        {nameLocked ? (
                          <span className="mt-1.5 block text-xs leading-relaxed text-neutral-500">
                            {editing
                              ? "Only this person can change their name, from their Settings."
                              : "Taken from the access request. They can change it later from their Settings."}
                          </span>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Work email
                        </span>
                        <input
                          ref={emailRef}
                          value={form.email}
                          disabled={Boolean(editing) || Boolean(fromRequest)}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                          placeholder="dev@company.com"
                          className={`${FIELD_COMPACT} disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500`}
                        />
                      </label>

                      {!editing ? (
                        <label className="block">
                          <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                            Send invite with
                          </span>
                          <select
                            value={form.provider}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                provider: event.target.value as ProviderId,
                              }))
                            }
                            className={SELECT}
                            style={{ backgroundImage: SELECT_CHEVRON }}
                          >
                            {PROVIDER_OPTIONS.map((tool) => {
                              const ready = connectedTools.includes(tool.id);
                              return (
                                <option
                                  key={tool.id}
                                  value={tool.id}
                                  disabled={!ready}
                                >
                                  {tool.label}
                                  {ready ? "" : " (not connected)"}
                                </option>
                              );
                            })}
                          </select>
                          <span className="mt-2 block text-xs text-neutral-500">
                            Delivery tool for the activation email. The platform
                            from-domain must be verified on the chosen tool.
                          </span>
                        </label>
                      ) : null}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <QuotaSelect
                          label="Domain quota"
                          value={form.domainQuota}
                          options={DOMAIN_QUOTA_OPTIONS}
                          onChange={(domainQuota) =>
                            setForm((current) => ({ ...current, domainQuota }))
                          }
                        />
                        <label className="block">
                          <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                            {editing ? "Access expires" : "Expires"}
                          </span>
                          {editing ? (
                            <>
                              {form.accessChoice === "other" ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    max={3650}
                                    inputMode="numeric"
                                    aria-label="Access expires in days"
                                    value={form.expiresDays}
                                    onChange={(event) =>
                                      setForm((current) => ({
                                        ...current,
                                        expiresDays: Number(event.target.value),
                                      }))
                                    }
                                    className={FIELD_COMPACT}
                                  />
                                  <span className="shrink-0 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                                    Days
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Keep current end date"
                                    title="Keep current"
                                    onClick={() =>
                                      setForm((current) => ({
                                        ...current,
                                        accessChoice: "keep",
                                      }))
                                    }
                                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                                  >
                                    <X className="size-4" aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={form.accessChoice}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      accessChoice: event.target
                                        .value as AccessChoice,
                                    }))
                                  }
                                  className={SELECT}
                                  style={{ backgroundImage: SELECT_CHEVRON }}
                                >
                                  <option value="keep">
                                    {editing.accessExpiresAt
                                      ? `${accessExpired(editing) ? "Expired" : "Until"} ${formatWhen(editing.accessExpiresAt)}`
                                      : "Never"}
                                  </option>
                                  <option value="7">In 7 days</option>
                                  <option value="30">In 30 days</option>
                                  <option value="90">In 90 days</option>
                                  <option value="other">Other</option>
                                  {editing.accessExpiresAt ? (
                                    <option value="never">Never</option>
                                  ) : null}
                                </select>
                              )}
                              <span className="mt-1.5 block text-xs leading-relaxed text-neutral-500">
                                After this date the member can no longer sign
                                in, use API keys or send.
                              </span>
                            </>
                          ) : form.expiresOther ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={365}
                                inputMode="numeric"
                                aria-label="Expires in days"
                                value={form.expiresDays}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    expiresDays: Number(event.target.value),
                                  }))
                                }
                                className={FIELD_COMPACT}
                              />
                              <span className="shrink-0 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                                Days
                              </span>
                              <button
                                type="button"
                                aria-label="Use 24 hours"
                                title="24 hours"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    expiresOther: false,
                                    expiresInHours: 24,
                                  }))
                                }
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                              >
                                <X className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <select
                              value={form.expiresNever ? "never" : form.expiresInHours}
                              disabled={Boolean(editing)}
                              onChange={(event) => {
                                if (event.target.value === "other") {
                                  setForm((current) => ({
                                    ...current,
                                    expiresOther: true,
                                    expiresNever: false,
                                  }));
                                  return;
                                }
                                if (event.target.value === "never") {
                                  setForm((current) => ({
                                    ...current,
                                    expiresOther: false,
                                    expiresNever: true,
                                  }));
                                  return;
                                }
                                setForm((current) => ({
                                  ...current,
                                  expiresOther: false,
                                  expiresNever: false,
                                  expiresInHours: Number(event.target.value) as
                                    24 | 48,
                                }));
                              }}
                              className={`${SELECT} disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500`}
                              style={{ backgroundImage: SELECT_CHEVRON }}
                            >
                              <option value={24}>24 hours</option>
                              <option value={48}>48 hours</option>
                              <option value="other">Other</option>
                              <option value="never">Never</option>
                            </select>
                          )}
                        </label>
                        <QuotaSelect
                          label="Daily sends"
                          value={form.dailyQuota}
                          options={DAILY_QUOTA_OPTIONS}
                          onChange={(dailyQuota) =>
                            setForm((current) => ({ ...current, dailyQuota }))
                          }
                        />
                        <QuotaSelect
                          label="Monthly sends"
                          value={form.monthlyQuota}
                          options={MONTHLY_QUOTA_OPTIONS}
                          onChange={(monthlyQuota) =>
                            setForm((current) => ({
                              ...current,
                              monthlyQuota,
                            }))
                          }
                        />
                      </div>

                      <label className="flex items-center justify-between gap-4 rounded-sm border border-neutral-200 bg-neutral-50 px-4 py-3">
                        <span>
                          <span className="block text-sm text-neutral-900">
                            API keys
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            Allow this seat to generate workspace keys.
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.apiKeysEnabled}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              apiKeysEnabled: event.target.checked,
                            }))
                          }
                          className="size-4 accent-[#0A4BD6]"
                        />
                      </label>

                      {error ? (
                        <p className="text-sm text-red-600">{error}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
                      <button
                        type="button"
                        className={BTN_GHOST}
                        onClick={closeModal}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        disabled={saving}
                        onClick={() =>
                          void (editing ? saveEdit() : sendInvite())
                        }
                      >
                        {saving
                          ? "Saving…"
                          : editing
                            ? "Save"
                            : fromRequest
                              ? "Accept and send invite"
                              : "Send invite"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {menuUser && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: MENU_WIDTH,
              }}
              className={`fixed z-50 overflow-hidden rounded-sm py-1 ${PORTAL_SURFACE}`}
            >
              {menuUser.status === "active" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                  onClick={() => openEdit(menuUser)}
                >
                  Edit access
                </button>
              ) : null}
              {menuUser.status === "active" &&
              menuUser.email !== sessionEmail ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => void changeStatus(menuUser, "suspended")}
                >
                  Suspend
                </button>
              ) : null}
              {menuUser.status === "pending" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => void revokeInvite(menuUser.id)}
                >
                  Revoke invite
                </button>
              ) : null}
              {menuUser.status === "suspended" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={() => void changeStatus(menuUser, "active")}
                  >
                    Reactivate
                  </button>
                  {confirmDeleteId === menuUser.id ? (
                    <div className="border-t border-neutral-200 px-3 py-2">
                      <p className="text-xs leading-relaxed text-neutral-600">
                        Deletes the account, its domains, keys and logs.
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        className="mt-2 w-full rounded-sm bg-red-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                        onClick={() => void deleteUser(menuUser.id)}
                      >
                        Delete for good
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(menuUser.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function QuotaSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: readonly number[];
  onChange: (value: number | null) => void;
}) {
  const choices =
    value === null || options.includes(value)
      ? options
      : [...options, value].sort((a, b) => a - b);
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
        {label}
      </span>
      <select
        value={value === null ? "unlimited" : String(value)}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "unlimited" ? null : Number(next));
        }}
        className={SELECT}
        style={{ backgroundImage: SELECT_CHEVRON }}
      >
        {choices.map((option) => (
          <option key={option} value={option}>
            {option.toLocaleString("en-US")}
          </option>
        ))}
        <option value="unlimited">Unlimited</option>
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "pending"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-600";
  return (
    <span
      className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${tone}`}
    >
      {status}
    </span>
  );
}

function CopyRow({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="mb-2 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code
          title={value}
          className={`min-w-0 flex-1 truncate rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2.5 font-mono text-neutral-900 ${
            large ? "text-base font-semibold tracking-wider" : "text-xs"
          }`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

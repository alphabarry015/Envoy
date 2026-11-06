import { MoreVertical, UserPlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  DAILY_QUOTA_OPTIONS,
  MONTHLY_QUOTA_OPTIONS,
  formatQuota,
} from "../../lib/apiKeys";
import { readSession } from "../../lib/auth";
import { accountInitials, accountName } from "../../lib/account";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";
import {
  type ConsoleUser,
  type UserRole,
  type UserStatus,
  DOMAIN_QUOTA_OPTIONS,
  fetchUsers,
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
  expiresDays: number;
};

type IssuedInvite = {
  email: string;
};

function emptyForm(): FormState {
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
    expiresDays: 7,
  };
}

function formFromUser(user: ConsoleUser): FormState {
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
    expiresDays: 7,
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
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const seats = users.filter((user) => user.email !== sessionEmail);
  const editing = seats.find((user) => user.id === editingId) ?? null;
  const menuUser = seats.find((user) => user.id === menuId) ?? null;
  const pendingCount = seats.filter((user) => user.status === "pending").length;

  async function reload() {
    setLoadError(null);
    try {
      setUsers(await fetchUsers());
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function closeMenu() {
    setMenuId(null);
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
    setError(null);
    setForm(emptyForm());
  }

  function openInvite() {
    closeMenu();
    setForm(emptyForm());
    setEditingId(null);
    setIssued(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(user: ConsoleUser) {
    closeMenu();
    setForm(formFromUser(user));
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
    const days = Math.trunc(form.expiresDays);
    if (form.expiresOther && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setError("Enter a number of days between 1 and 365.");
      return;
    }
    setSaving(true);
    try {
      const issuedInvite = await issueInvite({
        ...form,
        name,
        email,
        expiresInHours: form.expiresOther ? days * 24 : form.expiresInHours,
      });
      await reload();
      setIssued(issuedInvite);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not send the invite.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (!form.name.trim()) {
      setError("Enter the person's name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateUser(editing, {
        ...form,
        name: form.name.trim(),
        email: editing.email,
      });
      await reload();
      closeModal();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not update this user.");
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
      setLoadError(cause instanceof Error ? cause.message : "Could not update this user.");
    }
  }

  async function revokeInvite(id: string) {
    closeMenu();
    setLoadError(null);
    try {
      await revokeUserInvite(id);
      await reload();
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : "Could not revoke this invite.");
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

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Workspace seats · {seats.length} · {pendingCount} pending
          </p>
        </div>
        {loadError ? <p className="px-5 py-4 text-sm text-red-600">{loadError}</p> : null}
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
                          {accountInitials(user.name?.trim() || accountName(user.email))}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-950">
                            {user.name?.trim() || accountName(user.email)}
                          </span>
                          <span className="block truncate text-neutral-500">{user.email}</span>
                          {user.status === "pending" && user.expiresAt ? (
                            <span className="mt-1 block font-mono text-[11px] text-neutral-400">
                              Expires {formatWhen(user.expiresAt)}
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
                      {issued ? "Invitation sent" : editing ? "Access" : "Invitation"}
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      {issued
                        ? "Check the inbox"
                        : editing
                          ? "Update quotas"
                          : "Invite a user"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {issued
                        ? `${issued.email} receives a link to /auth/accept-invite.`
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
                    <p className="text-sm leading-relaxed text-neutral-600">
                      The activation email is on its way to {issued.email}. The link expires with the
                      delay you chose and works once.
                    </p>
                    <div className="flex justify-end">
                      <button type="button" className={BTN_PRIMARY} onClick={closeModal}>
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
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Ada Lovelace"
                          autoComplete="name"
                          className={FIELD_COMPACT}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Work email
                        </span>
                        <input
                          ref={emailRef}
                          value={form.email}
                          disabled={Boolean(editing)}
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

                      <div>
                        <p className="mb-2 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Role
                        </p>
                        <div
                          role="group"
                          aria-label="Role"
                          className="inline-flex rounded-sm border border-neutral-200 bg-white p-0.5"
                        >
                          {(["member", "admin"] as const).map((role) => (
                            <button
                              key={role}
                              type="button"
                              aria-pressed={form.role === role}
                              onClick={() =>
                                setForm((current) => ({ ...current, role }))
                              }
                              className={`rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase transition-colors ${
                                form.role === role
                                  ? "bg-[#0A4BD6] text-white"
                                  : "text-neutral-500 hover:text-[#0A4BD6]"
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </div>

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
                            Expires
                          </span>
                          {form.expiresOther && !editing ? (
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
                              value={form.expiresInHours}
                              disabled={Boolean(editing)}
                              onChange={(event) => {
                                if (event.target.value === "other") {
                                  setForm((current) => ({ ...current, expiresOther: true }));
                                  return;
                                }
                                setForm((current) => ({
                                  ...current,
                                  expiresOther: false,
                                  expiresInHours: Number(event.target.value) as 24 | 48,
                                }));
                              }}
                              className={`${SELECT} disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500`}
                              style={{ backgroundImage: SELECT_CHEVRON }}
                            >
                              <option value={24}>24 hours</option>
                              <option value={48}>48 hours</option>
                              <option value="other">Other</option>
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
                        onClick={() => void (editing ? saveEdit() : sendInvite())}
                      >
                        {saving ? "Saving…" : editing ? "Save" : "Send invite"}
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
              style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
              className={`fixed z-50 overflow-hidden rounded-sm py-1 ${PORTAL_SURFACE}`}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => openEdit(menuUser)}
              >
                Edit quotas
              </button>
              {menuUser.status === "pending" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => void revokeInvite(menuUser.id)}
                >
                  Revoke invite
                </button>
              ) : menuUser.email === sessionEmail ? null : menuUser.status ===
                "suspended" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                  onClick={() => void changeStatus(menuUser, "active")}
                >
                  Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => void changeStatus(menuUser, "suspended")}
                >
                  Suspend
                </button>
              )}
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
        {options.map((option) => (
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

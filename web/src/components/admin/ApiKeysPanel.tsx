import {
  Check,
  Copy,
  Globe2,
  KeyRound,
  Mail,
  MoreVertical,
  ScrollText,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";

import {
  type ApiKeyScope,
  type ConsoleApiKey,
  API_KEY_SCOPES,
  DAILY_QUOTA_OPTIONS,
  MONTHLY_QUOTA_OPTIONS,
  createRemoteApiKey,
  deleteRemoteApiKey,
  fetchApiKeys,
  formatQuota,
  revokeRemoteApiKey,
} from "../../lib/apiKeys";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import { PageLoading } from "../ui/ScanLoading";
import { useConsoleAccount } from "./consoleAccount";

const SELECT =
  "h-11 w-full appearance-none rounded-sm border border-neutral-200 bg-neutral-50 bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-4 pr-10 text-sm text-neutral-950 outline-none focus:border-[#0A4BD6] focus:bg-white focus:ring-2 focus:ring-[#0A4BD6]/20";

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const SCOPE_ICONS: Record<
  ApiKeyScope,
  ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>
> = {
  send: Mail,
  domains: Globe2,
  logs: ScrollText,
};

const MENU_WIDTH = 140;

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function resetFormDefaults() {
  return {
    name: "",
    scopes: ["send"] as ApiKeyScope[],
    dailyQuota: 5_000 as number | null,
    monthlyQuota: 100_000 as number | null,
  };
}

export default function ApiKeysPanel() {
  const titleId = useId();
  const { isAdmin } = useConsoleAccount();
  const [keys, setKeys] = useState<ConsoleApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(resetFormDefaults);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ConsoleApiKey | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchApiKeys()
      .then((rows) => {
        if (!cancelled) setKeys(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : "Could not load API keys.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleScope(scope: ApiKeyScope) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  function openCreateModal() {
    setForm(resetFormDefaults());
    setError(null);
    setRevealed(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setRevealed(null);
    setForm(resetFormDefaults());
  }

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

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!revealed) {
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen, revealed]);

  useEffect(() => {
    if (!menuId) return;
    const openId = menuId;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      const trigger = triggerRefs.current[openId];
      if (trigger?.contains(target)) return;
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

  async function addKey() {
    const label = form.name.trim();
    setError(null);
    if (!label) {
      setError("Give this key a name (e.g. Production, CI).");
      return;
    }
    if (keys.some((key) => key.name.toLowerCase() === label.toLowerCase())) {
      setError("A key with this name already exists.");
      return;
    }
    if (form.scopes.length === 0) {
      setError("Select at least one permission (Send, Domains, or Logs).");
      return;
    }

    setSaving(true);
    try {
      const key = await createRemoteApiKey({
        name: label,
        mode: "live",
        scopes: form.scopes,
        dailyQuota: isAdmin ? form.dailyQuota : null,
        monthlyQuota: isAdmin ? form.monthlyQuota : null,
      });
      setKeys((current) => [toStoredView(key), ...current]);
      setForm(resetFormDefaults());
      setRevealed(key);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not create the key.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey(id: string) {
    closeMenu();
    try {
      const next = await revokeRemoteApiKey(id);
      setKeys((current) => current.map((key) => (key.id === id ? next : key)));
      setLoadError(null);
    } catch (reason: unknown) {
      setLoadError(reason instanceof Error ? reason.message : "Could not revoke the key.");
    }
  }

  async function deleteKey(id: string) {
    closeMenu();
    try {
      await deleteRemoteApiKey(id);
      setKeys((current) => current.filter((key) => key.id !== id));
      setLoadError(null);
    } catch (reason: unknown) {
      setLoadError(reason instanceof Error ? reason.message : "Could not delete the key.");
    }
  }

  const menuKey = menuId ? keys.find((key) => key.id === menuId) : null;

  async function copyValue(token: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(token);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const activeCount = keys.filter((key) => key.status === "active").length;

  if (loading) {
    return <PageLoading>Loading keys…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Secrets are shown once. Keys are hashed at rest (SHA-256).
        </p>
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        <button type="button" onClick={openCreateModal} className={BTN_PRIMARY}>
          <KeyRound className="size-3.5" aria-hidden="true" />
          Generate key
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Workspace keys · {activeCount} active / {keys.length} total
          </p>
        </div>

        {keys.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <KeyRound className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              No API keys yet. Generate your first workspace key.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/80 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Key</th>
                  <th className="px-5 py-2.5 font-medium">Mode</th>
                  <th className="px-5 py-2.5 font-medium">Permissions</th>
                  <th className="px-5 py-2.5 font-medium">Quotas</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Created</th>
                  <th className="px-5 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr
                    key={key.id}
                    className="border-b border-neutral-200 last:border-0"
                  >
                    <td className="px-5 py-4 font-medium text-neutral-900">
                      {key.name}
                    </td>
                    <td className="px-5 py-4">
                      <div className="group/cell flex min-w-0 items-center gap-1.5 font-mono text-xs text-neutral-600">
                        <span className="truncate">{key.prefix}</span>
                        <button
                          type="button"
                          aria-label="Copy key prefix"
                          title="Copy prefix"
                          onClick={() => void copyValue(key.id, key.prefix)}
                          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-all hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6] ${
                            copied === key.id
                              ? "opacity-100"
                              : "opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
                          }`}
                        >
                          {copied === key.id ? (
                            <Check
                              className="size-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                          ) : (
                            <Copy className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] ${
                          key.mode === "sandbox"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-[#0A4BD6]/10 text-[#0A4BD6]"
                        }`}
                      >
                        {key.mode}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-neutral-500">
                      {key.scopes.join(" · ")}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-neutral-500">
                      {formatQuota(key.dailyQuota)}/d ·{" "}
                      {formatQuota(key.monthlyQuota)}/mo
                    </td>
                    <td className="px-5 py-4">
                      {key.status === "active" ? (
                        <span className="inline-flex rounded-sm bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                          active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-sm bg-red-50 px-2 py-0.5 font-mono text-[11px] text-red-600">
                          revoked
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500">
                      {formatWhen(key.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        ref={(node) => {
                          triggerRefs.current[key.id] = node;
                        }}
                        aria-haspopup="menu"
                        aria-expanded={menuId === key.id}
                        aria-label={`${key.name} actions`}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-600 transition-colors hover:border-[#0A4BD6]/40 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                        onClick={() => openMenu(key.id)}
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
                      {revealed?.secret ? "Secret ready" : "API access"}
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      {revealed?.secret
                        ? "Copy this key now"
                        : "Generate API key"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {revealed?.secret
                        ? `${revealed.name} · shown once, then hashed at rest.`
                        : isAdmin
                          ? "Name, permissions and send quotas."
                          : "Name and permissions. Send quotas stay the ones set for this account."}
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

                {revealed?.secret ? (
                  <div className="space-y-5 p-6">
                    <div className="rounded-sm border border-[#0A4BD6]/20 bg-[#0A4BD6]/[0.04] p-4">
                      <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                        Bearer token
                      </p>
                      <code className="mt-3 block overflow-x-auto font-mono text-sm leading-relaxed break-all text-neutral-800">
                        {revealed.secret}
                      </code>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className={BTN_GHOST}
                        onClick={closeModal}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        onClick={() =>
                          void copyValue("secret", revealed.secret!)
                        }
                      >
                        {copied === "secret" ? (
                          <>
                            <Check className="size-3.5" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" aria-hidden="true" />
                            Copy secret
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                      <div>
                        <label className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Key name
                        </label>
                        <input
                          ref={nameInputRef}
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") addKey();
                          }}
                          placeholder="Production"
                          className={FIELD_COMPACT}
                        />
                      </div>

                      <fieldset>
                        <legend className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Permissions
                        </legend>
                        <div className="mt-3 grid gap-2">
                          {API_KEY_SCOPES.map((scope) => {
                            const active = form.scopes.includes(scope.id);
                            const Icon = SCOPE_ICONS[scope.id];
                            return (
                              <button
                                key={scope.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleScope(scope.id)}
                                className={`flex w-full items-start gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors ${
                                  active
                                    ? "border-[#0A4BD6] bg-[#0A4BD6]/5"
                                    : "border-neutral-200 bg-white hover:border-[#0A4BD6]/35"
                                }`}
                              >
                                <span
                                  className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm ${
                                    active
                                      ? "bg-[#0A4BD6] text-white"
                                      : "bg-neutral-100 text-neutral-500"
                                  }`}
                                >
                                  <Icon className="size-3.5" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-neutral-900">
                                    {scope.label}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-neutral-500">
                                    {scope.description}
                                  </span>
                                </span>
                                <span
                                  className={`mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                                    active
                                      ? "border-[#0A4BD6] bg-[#0A4BD6] text-white"
                                      : "border-neutral-300 bg-white"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {active ? (
                                    <Check className="size-3" />
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      {isAdmin ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="api-key-daily-quota"
                            className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
                          >
                            Daily quota
                          </label>
                          <select
                            id="api-key-daily-quota"
                            value={
                              form.dailyQuota === null
                                ? "unlimited"
                                : String(form.dailyQuota)
                            }
                            onChange={(event) => {
                              const next = event.target.value;
                              setForm((current) => ({
                                ...current,
                                dailyQuota:
                                  next === "unlimited" ? null : Number(next),
                              }));
                            }}
                            className={SELECT}
                            style={{ backgroundImage: SELECT_CHEVRON }}
                          >
                            {DAILY_QUOTA_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {formatQuota(value)} / day
                              </option>
                            ))}
                            <option value="unlimited">Unlimited</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="api-key-monthly-quota"
                            className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
                          >
                            Monthly quota
                          </label>
                          <select
                            id="api-key-monthly-quota"
                            value={
                              form.monthlyQuota === null
                                ? "unlimited"
                                : String(form.monthlyQuota)
                            }
                            onChange={(event) => {
                              const next = event.target.value;
                              setForm((current) => ({
                                ...current,
                                monthlyQuota:
                                  next === "unlimited" ? null : Number(next),
                              }));
                            }}
                            className={SELECT}
                            style={{ backgroundImage: SELECT_CHEVRON }}
                          >
                            {MONTHLY_QUOTA_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {formatQuota(value)} / month
                              </option>
                            ))}
                            <option value="unlimited">Unlimited</option>
                          </select>
                        </div>
                      </div>
                      ) : null}

                      {error ? (
                        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                          {error}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-neutral-400">
                          Prefix <span className="font-mono">envoy_live_</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
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
                            onClick={() => void addKey()}
                            disabled={saving}
                          >
                            <KeyRound className="size-3.5" aria-hidden="true" />
                            {saving ? "Generating…" : "Generate key"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {menuKey && menuPos
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
              {menuKey.status === "active" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => revokeKey(menuKey.id)}
                >
                  Revoke
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => deleteKey(menuKey.id)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function toStoredView(key: ConsoleApiKey): ConsoleApiKey {
  const { secret: _secret, ...rest } = key;
  return rest;
}

import { Check, Copy, MoreVertical, Trash2, Webhook, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BTN_GHOST, BTN_PRIMARY, FIELD_COMPACT, PORTAL_SURFACE } from "../../lib/consoleUi";
import { PROVIDER_OPTIONS, providerLabel } from "../../lib/providerOptions";
import { PageLoading } from "../ui/ScanLoading";
import {
  type ConsoleWebhook,
  type WebhookEvent,
  WEBHOOK_EVENTS,
  createRemoteWebhook,
  deleteRemoteWebhook,
  fetchWebhooks,
  normalizeWebhookUrl,
  rotateRemoteWebhookSecret,
  setRemoteWebhookStatus,
  updateRemoteWebhook,
} from "../../lib/webhooks";

const MENU_WIDTH = 168;

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function emptyForm() {
  return {
    name: "",
    url: "",
    events: ["email.delivered", "email.bounced", "email.complained"] as WebhookEvent[],
    providers: [] as string[],
  };
}

export default function WebhooksPanel() {
  const titleId = useId();
  const [webhooks, setWebhooks] = useState<ConsoleWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ConsoleWebhook | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setRevealed(null);
    setModalOpen(true);
  }

  function openEdit(webhook: ConsoleWebhook) {
    setEditingId(webhook.id);
    setForm({
      name: webhook.name,
      url: webhook.url,
      events: [...webhook.events],
      providers: webhook.providers ? [...webhook.providers] : [],
    });
    setError(null);
    setRevealed(null);
    setModalOpen(true);
    closeMenu();
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setError(null);
    setRevealed(null);
    setForm(emptyForm());
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
    let cancelled = false;
    void fetchWebhooks()
      .then((rows) => {
        if (!cancelled) setWebhooks(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : "Could not load webhooks.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleEvent(eventId: WebhookEvent) {
    setForm((current) => ({
      ...current,
      events: current.events.includes(eventId)
        ? current.events.filter((item) => item !== eventId)
        : [...current.events, eventId],
    }));
  }

  function toggleProvider(providerId: string) {
    setForm((current) => ({
      ...current,
      providers: current.providers.includes(providerId)
        ? current.providers.filter((item) => item !== providerId)
        : [...current.providers, providerId],
    }));
  }

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!revealed) window.setTimeout(() => nameInputRef.current?.focus(), 0);
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

  async function saveWebhook() {
    const name = form.name.trim();
    const url = normalizeWebhookUrl(form.url);
    setError(null);
    if (!name) {
      setError("Give this webhook a name.");
      return;
    }
    if (!url) {
      setError("Use an https URL. http is only allowed on localhost.");
      return;
    }
    if (form.events.length === 0) {
      setError("Select at least one event.");
      return;
    }
    const duplicate = webhooks.some(
      (webhook) => webhook.id !== editingId && webhook.url === url,
    );
    if (duplicate) {
      setError("An endpoint with this URL already exists.");
      return;
    }

    setSaving(true);
    try {
      const providers = form.providers.length > 0 ? form.providers : null;
      if (editingId) {
        const updated = await updateRemoteWebhook(editingId, {
          name,
          url,
          events: form.events,
          providers,
        });
        setWebhooks((current) => current.map((webhook) => (webhook.id === editingId ? updated : webhook)));
        closeModal();
        return;
      }
      const webhook = await createRemoteWebhook({
        name,
        url,
        events: form.events,
        providers,
      });
      setWebhooks((current) => [withoutSecret(webhook), ...current]);
      setRevealed(webhook);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not save this webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(webhook: ConsoleWebhook) {
    closeMenu();
    try {
      const nextStatus = webhook.status === "active" ? "disabled" : "active";
      const updated = await setRemoteWebhookStatus(webhook.id, nextStatus);
      setWebhooks((current) => current.map((item) => (item.id === webhook.id ? updated : item)));
      setLoadError(null);
    } catch (reason: unknown) {
      setLoadError(reason instanceof Error ? reason.message : "Could not update this webhook.");
    }
  }

  async function rotateSecret(id: string) {
    closeMenu();
    try {
      const rotated = await rotateRemoteWebhookSecret(id);
      setWebhooks((current) => current.map((webhook) => (webhook.id === id ? withoutSecret(rotated) : webhook)));
      setEditingId(null);
      setError(null);
      setRevealed(rotated);
      setModalOpen(true);
    } catch (reason: unknown) {
      setLoadError(reason instanceof Error ? reason.message : "Could not rotate the secret.");
    }
  }

  async function deleteWebhook(id: string) {
    closeMenu();
    try {
      await deleteRemoteWebhook(id);
      setWebhooks((current) => current.filter((webhook) => webhook.id !== id));
      setLoadError(null);
    } catch (reason: unknown) {
      setLoadError(reason instanceof Error ? reason.message : "Could not delete this webhook.");
    }
  }

  async function copyValue(token: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(token);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const menuWebhook = menuId ? webhooks.find((webhook) => webhook.id === menuId) : null;
  const activeCount = webhooks.filter((webhook) => webhook.status === "active").length;
  const editing = Boolean(editingId);

  if (loading) {
    return <PageLoading>Loading webhooks…</PageLoading>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Endpoints receive delivery events. Each request includes X-Envoy-Event and
          X-Envoy-Signature. The signing secret is shown once.
        </p>
        {loadError ? <p className="w-full text-sm text-red-600">{loadError}</p> : null}
        <button type="button" onClick={openCreate} className={BTN_PRIMARY}>
          <Webhook className="size-3.5" aria-hidden="true" />
          Create webhook
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Endpoints · {activeCount} active / {webhooks.length} total
          </p>
        </div>

        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Webhook className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">No webhooks yet. Add an endpoint to receive events.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[28%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-[11px] tracking-widest text-neutral-400 uppercase">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Endpoint</th>
                  <th className="px-5 py-3 font-medium">Events</th>
                  <th className="px-5 py-3 font-medium">Providers</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id} className="border-b border-neutral-200 last:border-b-0">
                    <td className="px-5 py-4 font-medium text-neutral-950">{webhook.name}</td>
                    <td className="px-5 py-4">
                      <div className="group/cell flex min-w-0 items-center gap-1.5 font-mono text-xs text-neutral-600">
                        <span className="truncate">{webhook.url}</span>
                        <button
                          type="button"
                          aria-label="Copy endpoint"
                          title="Copy endpoint"
                          onClick={() => void copyValue(webhook.id, webhook.url)}
                          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-all hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6] ${
                            copied === webhook.id
                              ? "opacity-100"
                              : "opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
                          }`}
                        >
                          {copied === webhook.id ? (
                            <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-neutral-500">{webhook.events.join(" · ")}</td>
                    <td className="px-5 py-4 font-mono text-[11px] text-neutral-500">
                      {webhook.providers?.length
                        ? webhook.providers.map((id) => providerLabel(id)).join(" · ")
                        : "All"}
                    </td>
                    <td className="px-5 py-4">
                      {webhook.status === "active" ? (
                        <span className="inline-flex rounded-sm bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                          active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-sm bg-neutral-200 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
                          disabled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500">{formatWhen(webhook.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        ref={(node) => {
                          triggerRefs.current[webhook.id] = node;
                        }}
                        aria-haspopup="menu"
                        aria-expanded={menuId === webhook.id}
                        aria-label={`${webhook.name} actions`}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-neutral-200 text-neutral-600 transition-colors hover:border-[#0A4BD6]/40 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                        onClick={() => openMenu(webhook.id)}
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
                      {revealed?.secret ? "Secret ready" : "Webhooks"}
                    </p>
                    <h2 id={titleId} className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">
                      {revealed?.secret ? "Copy this secret now" : editing ? "Edit webhook" : "Create webhook"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {revealed?.secret
                        ? `${revealed.name} · shown once, then only the prefix is kept.`
                        : "Name, endpoint, and the events to deliver."}
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
                      <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">Signing secret</p>
                      <code className="mt-3 block overflow-x-auto font-mono text-sm leading-relaxed break-all text-neutral-800">
                        {revealed.secret}
                      </code>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={BTN_GHOST} onClick={closeModal}>
                        Done
                      </button>
                      <button type="button" className={BTN_PRIMARY} onClick={() => void copyValue("secret", revealed.secret!)}>
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
                          Name
                        </label>
                        <input
                          ref={nameInputRef}
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Production"
                          className={FIELD_COMPACT}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Endpoint URL
                        </label>
                        <input
                          value={form.url}
                          onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                          placeholder="https://hooks.acme.io/envoy"
                          className={FIELD_COMPACT}
                        />
                      </div>
                      <fieldset>
                        <legend className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">Events</legend>
                        <div className="mt-3 grid gap-2">
                          {WEBHOOK_EVENTS.map((event) => {
                            const active = form.events.includes(event.id);
                            return (
                              <button
                                key={event.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleEvent(event.id)}
                                className={`flex w-full items-start gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors ${
                                  active
                                    ? "border-[#0A4BD6] bg-[#0A4BD6]/5"
                                    : "border-neutral-200 bg-white hover:border-[#0A4BD6]/35"
                                }`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-neutral-900">{event.label}</span>
                                  <span className="mt-0.5 block text-xs text-neutral-500">{event.description}</span>
                                </span>
                                <span
                                  className={`mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                                    active ? "border-[#0A4BD6] bg-[#0A4BD6] text-white" : "border-neutral-300 bg-white"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {active ? <Check className="size-3" /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                          Providers
                        </legend>
                        <p className="mt-2 text-xs text-neutral-500">
                          Leave all unchecked to receive events from every transport.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {PROVIDER_OPTIONS.map((provider) => {
                            const active = form.providers.includes(provider.id);
                            return (
                              <button
                                key={provider.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleProvider(provider.id)}
                                className={`flex w-full items-center justify-between gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors ${
                                  active
                                    ? "border-[#0A4BD6] bg-[#0A4BD6]/5"
                                    : "border-neutral-200 bg-white hover:border-[#0A4BD6]/35"
                                }`}
                              >
                                <span className="text-sm font-medium text-neutral-900">{provider.label}</span>
                                <span
                                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                                    active ? "border-[#0A4BD6] bg-[#0A4BD6] text-white" : "border-neutral-300 bg-white"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {active ? <Check className="size-3" /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                      {error ? (
                        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={BTN_GHOST} onClick={closeModal}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={BTN_PRIMARY}
                          onClick={() => void saveWebhook()}
                          disabled={saving}
                        >
                          <Webhook className="size-3.5" aria-hidden="true" />
                          {saving ? "Saving…" : editing ? "Save" : "Create webhook"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {menuWebhook && menuPos
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => openEdit(menuWebhook)}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => toggleStatus(menuWebhook)}
              >
                {menuWebhook.status === "active" ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                onClick={() => rotateSecret(menuWebhook.id)}
              >
                Rotate secret
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                onClick={() => deleteWebhook(menuWebhook.id)}
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

function withoutSecret(webhook: ConsoleWebhook): ConsoleWebhook {
  const { secret: _secret, ...rest } = webhook;
  return rest;
}

import { ChevronRight, LayoutGrid, LayoutTemplate, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import {
  type ConsoleTemplate,
  createTemplate,
  extractVariables,
  readStoredTemplates,
  slugAlias,
  writeStoredTemplates,
} from "../../lib/templates";

const ALIAS_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function TemplatesPanel() {
  const titleId = useId();
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<ConsoleTemplate[]>(() =>
    readStoredTemplates(),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasTouched, setAliasTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConsoleTemplate | null>(null);

  function closeModal() {
    setModalOpen(false);
    setName("");
    setAlias("");
    setAliasTouched(false);
    setError(null);
  }

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => nameRef.current?.focus(), 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!pendingDelete) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingDelete(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  function addTemplate() {
    const label = name.trim();
    const nextAlias = slugAlias(alias || label);
    setError(null);
    if (!label) {
      setError("Give this template a name.");
      return;
    }
    if (!ALIAS_PATTERN.test(nextAlias)) {
      setError("Alias must use lowercase letters, numbers and dashes.");
      return;
    }
    if (templates.some((template) => template.alias === nextAlias)) {
      setError("This alias is already used.");
      return;
    }
    const template = createTemplate(label, nextAlias);
    const next = [template, ...templates];
    setTemplates(next);
    writeStoredTemplates(next);
    closeModal();
    navigate(`/console/templates/${template.id}`);
  }

  function deleteTemplate() {
    if (!pendingDelete) return;
    const next = templates.filter((template) => template.id !== pendingDelete.id);
    setTemplates(next);
    writeStoredTemplates(next);
    setPendingDelete(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Store the message once and send it by alias with {"{{variables}}"}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/console/templates/gallery" className={BTN_GHOST}>
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            Templates
          </Link>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
          >
            <LayoutTemplate className="size-3.5" aria-hidden="true" />
            New template
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Templates · {templates.length}
          </p>
        </div>
        {templates.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <LayoutTemplate className="size-8 text-neutral-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-500">
              No templates yet. Create the first reusable message.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {templates.map((template) => {
              const variables = extractVariables(template);
              return (
                <li key={template.id} className="flex items-center gap-2 pr-3 hover:bg-[#0A4BD6]/5">
                  <button
                    type="button"
                    onClick={() => navigate(`/console/templates/${template.id}`)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-neutral-900">
                        {template.name}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-neutral-400">
                        {template.alias}
                        {variables.length > 0
                          ? ` · ${variables.map((name) => `{{${name}}}`).join(" ")}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[11px] text-neutral-400">
                        {formatWhen(template.updatedAt)}
                      </span>
                      <ChevronRight
                        className="size-4 text-neutral-400"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${template.name}`}
                    title="Delete"
                    onClick={() => setPendingDelete(template)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
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
                className={`w-full max-w-lg rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      Template
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      New template
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      The alias is what the send API references.
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
                <div className="space-y-5 px-6 py-5">
                  <label className="block">
                    <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                      Name
                    </span>
                    <input
                      ref={nameRef}
                      value={name}
                      onChange={(event) => {
                        const next = event.target.value;
                        setName(next);
                        if (!aliasTouched) setAlias(slugAlias(next));
                      }}
                      placeholder="Invoice"
                      className={FIELD_COMPACT}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                      Alias
                    </span>
                    <input
                      value={alias}
                      onChange={(event) => {
                        setAliasTouched(true);
                        setAlias(event.target.value);
                      }}
                      placeholder="invoice"
                      className={`${FIELD_COMPACT} font-mono`}
                    />
                  </label>
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
                  <button type="button" className={BTN_GHOST} onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="button" className={BTN_PRIMARY} onClick={addTemplate}>
                    Create template
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingDelete
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setPendingDelete(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-template-title"
                className={`w-full max-w-lg rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
                      Template
                    </p>
                    <h2
                      id="delete-template-title"
                      className="mt-1 text-xl font-semibold tracking-tight text-neutral-950"
                    >
                      Delete template
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {pendingDelete.name} will be removed from this console. This
                      cannot be undone.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                    onClick={() => setPendingDelete(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2 px-6 py-4">
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    onClick={deleteTemplate}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

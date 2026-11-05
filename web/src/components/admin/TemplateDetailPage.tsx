import "@react-email/editor/themes/default.css";

import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import type { Content, Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { DragHandleRule } from "@tiptap/extension-drag-handle";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
  FOUR_COLUMNS,
  TEXT,
  THREE_COLUMNS,
  TWO_COLUMNS,
  type SlashCommandItem,
} from "@react-email/editor/ui";
import MonacoEditor from "@monaco-editor/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Braces,
  ChevronDown,
  CodeXml,
  Columns2,
  Columns3,
  Columns4,
  GripVertical,
  Image,
  Plus,
  Square,
  Type,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Link, Navigate, useParams } from "react-router-dom";

import "../../lib/monacoSetup";

import {
  BTN_GHOST,
  BTN_PRIMARY,
  FIELD_COMPACT,
  KICKER,
  PORTAL_SURFACE,
} from "../../lib/consoleUi";
import {
  type ConsoleTemplate,
  type TemplateStatus,
  type TemplateVariable,
  type VariableType,
  extractVariables,
  getStoredTemplate,
  readStoredTemplates,
  writeStoredTemplates,
} from "../../lib/templates";

const VARIABLE_TYPES: { id: VariableType; label: string }[] = [
  { id: "string", label: "String" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
];

const DRAG_BLOCKS = new Set(["twoColumns", "threeColumns", "fourColumns"]);

const buttonAlignKey = new PluginKey("envoyButtonAlign");

function alignmentAt(clientX: number, row: HTMLElement): "left" | "center" | "right" {
  const box = row.getBoundingClientRect();
  const ratio = box.width > 0 ? (clientX - box.left) / box.width : 0;
  if (ratio < 1 / 3) return "left";
  if (ratio < 2 / 3) return "center";
  return "right";
}

function buttonPos(view: EditorView, anchor: HTMLElement): number | null {
  const pos = view.posAtDOM(anchor, 0);
  const resolved = view.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === "button") return resolved.before(depth);
  }
  return null;
}

function buttonAlignPlugin() {
  return new Plugin({
    key: buttonAlignKey,
    view(editorView) {
      const handles = new Map<HTMLElement, HTMLButtonElement>();
      let frame = 0;

      function position(handle: HTMLElement, anchor: HTMLElement, layer: HTMLElement) {
        const box = anchor.getBoundingClientRect();
        const parent = layer.getBoundingClientRect();
        handle.style.left = `${box.left - parent.left + layer.scrollLeft - 32}px`;
        handle.style.top = `${box.top - parent.top + layer.scrollTop + (box.height - 28) / 2}px`;
      }

      function sync() {
        const layer = editorView.dom.parentElement;
        if (!layer || editorView.dom.offsetParent === null) {
          handles.forEach((handle) => handle.remove());
          handles.clear();
          return;
        }
        const seen = new Set<HTMLElement>();
        editorView.dom.querySelectorAll("a.node-button").forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const row = node.parentElement;
          if (!(row instanceof HTMLElement)) return;
          seen.add(node);
          let handle = handles.get(node);
          if (!handle) {
            handle = document.createElement("button");
            handle.type = "button";
            handle.className = "envoy-button-grip";
            handle.setAttribute("aria-label", "Déplacer");
            handle.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
            handle.addEventListener("pointerdown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              handle?.setPointerCapture(event.pointerId);
              const move = (pointer: PointerEvent) => {
                row.style.textAlign = alignmentAt(pointer.clientX, row);
                position(handle!, node, layer);
              };
              const up = (pointer: PointerEvent) => {
                handle?.removeEventListener("pointermove", move);
                handle?.removeEventListener("pointerup", up);
                const alignment = alignmentAt(pointer.clientX, row);
                row.style.textAlign = "";
                const pos = buttonPos(editorView, node);
                const button = pos == null ? null : editorView.state.doc.nodeAt(pos);
                if (button && button.attrs.alignment !== alignment && pos != null) {
                  editorView.dispatch(
                    editorView.state.tr.setNodeMarkup(pos, null, {
                      ...button.attrs,
                      alignment,
                    }),
                  );
                }
                position(handle!, node, layer);
              };
              handle?.addEventListener("pointermove", move);
              handle?.addEventListener("pointerup", up);
            });
            layer.appendChild(handle);
            handles.set(node, handle);
          }
          position(handle, node, layer);
        });
        for (const [anchor, handle] of handles) {
          if (seen.has(anchor)) continue;
          handle.remove();
          handles.delete(anchor);
        }
      }

      function schedule() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(sync);
      }

      const layer = editorView.dom.parentElement;
      layer?.addEventListener("scroll", schedule, { passive: true });
      schedule();

      return {
        update: schedule,
        destroy() {
          cancelAnimationFrame(frame);
          layer?.removeEventListener("scroll", schedule);
          handles.forEach((handle) => handle.remove());
          handles.clear();
        },
      };
    },
  });
}

const COLUMN_DRAG_RULES: DragHandleRule[] = [
  {
    id: "onlyButtonAndTable",
    evaluate: ({ node }) => (DRAG_BLOCKS.has(node.type.name) ? 0 : 1000),
  },
];

function formatFrom(name: string, email: string) {
  if (name && email) return `${name} <${email}>`;
  return email || name;
}

function parseFrom(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { fromName: "", fromEmail: value.trim() };
  return { fromName: match[1]?.trim() ?? "", fromEmail: match[2]?.trim() ?? "" };
}

export default function TemplateDetailPage() {
  const { templateId = "" } = useParams();
  const editorRef = useRef<EmailEditorRef>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef({ from: 1, to: 1 });
  const [template, setTemplate] = useState<ConsoleTemplate | null>(() =>
    getStoredTemplate(templateId),
  );
  const [empty, setEmpty] = useState(true);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const savedDocument = useRef<string | null>(null);
  const [variableMenu, setVariableMenu] = useState(false);
  const [variableModal, setVariableModal] = useState(false);
  const [blockMenu, setBlockMenu] = useState(false);
  const [dragEditor, setDragEditor] = useState<{ id: string; editor: Editor } | null>(null);

  useEffect(() => {
    setTemplate(getStoredTemplate(templateId));
    setEmpty(true);
    setShowHtml(false);
    setHtmlDraft("");
    setDirty(false);
    setPreviewHtml(null);
    savedDocument.current = null;
    setVariableMenu(false);
    setVariableModal(false);
    setBlockMenu(false);
  }, [templateId]);

  if (!template) {
    return <Navigate to="/console/templates" replace />;
  }

  const current = template;
  const initialContent = (current.document ?? current.html) as Content;

  function update(patch: Partial<ConsoleTemplate>) {
    setTemplate((item) => (item ? { ...item, ...patch } : item));
    if (!template) return;
    const changed = (Object.keys(patch) as (keyof ConsoleTemplate)[]).some(
      (key) => template[key] !== patch[key],
    );
    if (changed) setDirty(true);
  }

  function rememberCaret() {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    const { from, to } = editor.state.selection;
    caretRef.current = { from, to };
  }

  function restoreCaret() {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    const { from, to } = caretRef.current;
    const max = editor.state.doc.content.size;
    editor.commands.setTextSelection({
      from: Math.min(from, max),
      to: Math.min(to, max),
    });
  }

  function placeCaret(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("input, textarea, button, a")) return;
    const editor = editorRef.current?.editor;
    if (!editor) return;
    const prose = editor.view.dom;
    if (prose.contains(target)) return;
    const found = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (found) {
      editor.commands.setTextSelection(found.pos);
      return;
    }
    const box = prose.getBoundingClientRect();
    if (event.clientY >= box.top) editor.commands.focus("end");
  }

  function placeButton(alignment: "left" | "center" | "right") {
    if (showHtml) setShowHtml(false);
    const editor = editorRef.current?.editor;
    if (!editor) return;
    restoreCaret();
    if (editor.isActive("button")) {
      editor.chain().focus().updateAttributes("button", { alignment }).run();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: "button",
        attrs: { alignment },
        content: [{ type: "text", text: "Button" }],
      })
      .run();
    setEmpty(false);
  }

  function insert(item: SlashCommandItem) {
    if (showHtml) setShowHtml(false);
    const editor = editorRef.current?.editor;
    if (!editor) return;
    restoreCaret();
    const { from, to } = caretRef.current;
    item.command({ editor, range: { from, to } });
  }

  function insertVariable(rawName: string) {
    const token = variableToken(rawName);
    const editor = editorRef.current?.editor;
    if (!token || !editor) return;
    if (showHtml) setShowHtml(false);
    restoreCaret();
    editor.chain().focus().insertContent(token).run();
    setEmpty(false);
    setVariableMenu(false);
  }

  function saveVariable(variable: TemplateVariable) {
    const variables = [
      ...current.variables.filter((item) => item.name !== variable.name),
      variable,
    ].sort((left, right) => left.name.localeCompare(right.name));
    const next = { ...current, variables, updatedAt: new Date().toISOString() };
    setTemplate(next);
    writeStoredTemplates(
      readStoredTemplates().map((item) =>
        item.id === next.id ? { ...item, ...next } : item,
      ),
    );
    insertVariable(variable.name);
    setVariableModal(false);
  }

  function insertImage() {
    if (showHtml) setShowHtml(false);
    const editor = editorRef.current?.editor;
    if (!editor) return;
    restoreCaret();
    editor.chain().focus().run();
    (editor.commands as { uploadImage?: () => boolean }).uploadImage?.();
  }

  function applyHtmlDraft(html: string) {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    editor.commands.setContent(emailHtmlToEditorHtml(html), { emitUpdate: true });
    setEmpty(editor.isEmpty);
    update({
      html,
      text: htmlToPlainText(html),
      document: editor.getJSON(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function persist(status: TemplateStatus) {
    const editor = editorRef.current?.editor;
    let html = current.html;
    let text = current.text;
    if (showHtml) {
      html = htmlDraft;
      text = htmlToPlainText(htmlDraft);
      editor?.commands.setContent(emailHtmlToEditorHtml(htmlDraft), { emitUpdate: false });
    } else {
      const exported = await editorRef.current?.getEmail();
      html = exported?.html ?? html;
      text = exported?.text ?? text;
    }
    const document = editor?.getJSON() ?? current.document;
    const nextTemplate: ConsoleTemplate = {
      ...current,
      name: current.name.trim() || "Untitled Template",
      html,
      text,
      document,
      status,
      updatedAt: new Date().toISOString(),
    };
    writeStoredTemplates(
      readStoredTemplates().map((item) =>
        item.id === current.id ? nextTemplate : item,
      ),
    );
    if (editor) savedDocument.current = JSON.stringify(editor.getJSON());
    setTemplate(nextTemplate);
    setDirty(false);
  }

  async function openPreview() {
    const html = showHtml
      ? htmlDraft
      : ((await editorRef.current?.getEmailHTML()) ?? current.html);
    setPreviewHtml(html);
  }

  async function toggleHtml() {
    if (showHtml) {
      applyHtmlDraft(htmlDraft);
      setShowHtml(false);
      return;
    }
    const html = (await editorRef.current?.getEmailHTML()) ?? current.html;
    setHtmlDraft(formatHtmlSource(html));
    setBlockMenu(false);
    setVariableMenu(false);
    setShowHtml(true);
  }

  function loadHtml(file: File) {
    void file.text().then((html) => {
      const editor = editorRef.current?.editor;
      if (!editor) return;
      editor.commands.setContent(emailHtmlToEditorHtml(html));
      setEmpty(editor.isEmpty);
      update({
        html,
        text: htmlToPlainText(html),
        document: editor.getJSON(),
      });
    });
  }

  return (
    <div className="envoy-template-editor relative flex h-full min-h-0 flex-col bg-white text-neutral-950">
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-neutral-200 bg-white px-5 py-3 text-neutral-950">
        <Link
          to="/console/templates"
          aria-label="Retour"
          className="group justify-self-start"
        >
          <span className="relative flex h-5 w-28 items-center overflow-hidden">
            <span className="flex items-center gap-2.5 transition-all duration-200 group-hover:-translate-y-full group-hover:opacity-0">
              <span className="inline-block size-2 shrink-0 bg-[#0A4BD6]" aria-hidden="true" />
              <span className="text-sm font-semibold tracking-[0.18em]">ENVOY</span>
            </span>
            <span className="absolute inset-0 flex translate-y-full items-center gap-2 text-sm font-medium text-[#0A4BD6] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
              Retour
            </span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center justify-center text-sm">
          <Link to="/console/templates" className="shrink-0 text-neutral-500 hover:text-[#0A4BD6]">
            Templates
          </Link>
          <span className="px-1.5 text-neutral-300">/</span>
          <input
            value={current.name}
            onChange={(event) => update({ name: event.target.value })}
            aria-label="Template name"
            size={Math.max((current.name || "Untitled").length, 1)}
            className="max-w-56 min-w-0 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400 [field-sizing:content]"
            placeholder="Untitled"
          />
        </div>
        <div className="flex items-center justify-self-end gap-2">
          <button
            type="button"
            onClick={() => void openPreview()}
            className={`${BTN_GHOST} px-4 py-2`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => void persist(dirty ? current.status : "published")}
            className={`${BTN_PRIMARY} px-4 py-2`}
          >
            {dirty ? "Save" : "Publish"}
          </button>
        </div>
      </header>

      {showHtml ? (
        <HtmlCode
          html={htmlDraft}
          onChange={(value) => {
            setHtmlDraft(value);
            setDirty(true);
          }}
        />
      ) : null}

      <div
        className={showHtml ? "hidden" : "relative flex min-h-0 flex-1"}
        onMouseDown={placeCaret}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <div className="pointer-events-auto mx-auto w-[600px] max-w-full pt-8">
            <div className="grid gap-x-10 border-b border-neutral-200 py-2 sm:grid-cols-2">
              <MetaField label="From">
                <input
                  value={formatFrom(current.fromName, current.fromEmail)}
                  onChange={(event) => update(parseFrom(event.target.value))}
                  className="w-full bg-transparent text-sm text-neutral-950 outline-none"
                />
              </MetaField>
              <MetaField label="Reply-To">
                <input
                  value={current.replyTo}
                  onChange={(event) => update({ replyTo: event.target.value })}
                  placeholder="Reply-To"
                  className="w-full bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
                />
              </MetaField>
            </div>
            <div className="grid gap-x-10 border-b border-neutral-200 py-2 sm:grid-cols-2">
              <MetaField label="Subject">
                <input
                  value={current.subject}
                  onChange={(event) => update({ subject: event.target.value })}
                  placeholder="Subject"
                  className="w-full bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
                />
              </MetaField>
              <MetaField label="Preview text">
                <input
                  value={current.previewText}
                  onChange={(event) => update({ previewText: event.target.value })}
                  placeholder="Preview text"
                  className="w-full bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
                />
              </MetaField>
            </div>
            {empty ? (
              <div className="mt-8 flex flex-col gap-2 text-sm text-neutral-500">
                <Link to="/console/templates/gallery" className="w-fit rounded-sm hover:text-[#0A4BD6]">
                  Pick a template
                </Link>
                <button
                  type="button"
                  className="w-fit rounded-sm hover:text-[#0A4BD6]"
                  onClick={() => htmlInputRef.current?.click()}
                >
                  Upload HTML or Ctrl V
                </button>
                <input
                  ref={htmlInputRef}
                  type="file"
                  accept="text/html,.html"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) loadHtml(file);
                    event.target.value = "";
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <EmailEditor
          key={current.id}
          ref={editorRef}
          content={initialContent}
          placeholder=""
          theme="basic"
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto pt-40"
          onUploadImage={async (file) => ({
            url: await fileToDataUrl(file),
          })}
          onReady={(ref) => {
            setEmpty(ref.editor?.isEmpty ?? true);
            const editor = ref.editor;
            setDragEditor(editor ? { id: current.id, editor } : null);
            if (!editor) return;
            savedDocument.current = JSON.stringify(editor.getJSON());
            if (!editor.state.plugins.some((plugin) => plugin.spec.key === buttonAlignKey)) {
              editor.registerPlugin(buttonAlignPlugin());
            }
            const save = () => {
              const { from, to } = editor.state.selection;
              caretRef.current = { from, to };
            };
            save();
            editor.on("selectionUpdate", save);
          }}
          onUpdate={(ref) => {
            setEmpty(ref.editor?.isEmpty ?? false);
            const editor = ref.editor;
            if (!editor || savedDocument.current === null) return;
            if (JSON.stringify(editor.getJSON()) !== savedDocument.current) {
              setDirty(true);
            }
          }}
        >
          {dragEditor && dragEditor.id === current.id && !showHtml ? (
            <DragHandle
              editor={dragEditor.editor}
              className="envoy-drag-handle"
              nested={{
                edgeDetection: "none",
                rules: COLUMN_DRAG_RULES,
              }}
            >
              <span
                aria-label="Déplacer"
                className="inline-flex size-7 cursor-grab items-center justify-center rounded-sm border border-neutral-200 bg-white text-neutral-600 shadow-sm hover:border-[#0A4BD6]/40 hover:text-[#0A4BD6] active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </span>
            </DragHandle>
          ) : null}
        </EmailEditor>
      </div>

      <div className="fixed top-1/2 left-3 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-sm border border-neutral-200 bg-white p-1.5 text-neutral-600 shadow-sm">
        <RailButton
          label="Text"
          pressed={!showHtml}
          onMouseDown={rememberCaret}
          onClick={() => {
            if (showHtml) {
              void toggleHtml();
              return;
            }
            insert(TEXT);
          }}
        >
          <Type className="size-4" />
        </RailButton>
        {!showHtml ? (
          <>
        <RailButton label="Image" onMouseDown={rememberCaret} onClick={insertImage}>
          <Image className="size-4" />
        </RailButton>
        <div
          className="relative"
          onMouseEnter={() => setBlockMenu(true)}
          onMouseLeave={() => setBlockMenu(false)}
        >
          <RailButton
            label="Button"
            pressed={blockMenu}
            onMouseDown={rememberCaret}
            onClick={() => setBlockMenu(true)}
          >
            <Square className="size-4" />
          </RailButton>
          {blockMenu ? (
            <div className="absolute top-1/2 left-full z-30 -translate-y-1/2 pl-3">
              <div className="w-44 rounded-sm border border-neutral-200 bg-white p-1.5 text-neutral-950 shadow-lg">
                <p className={`px-2 pt-1 pb-1 ${KICKER}`}>
                  Button
                </p>
                <BlockChoice
                  label="Left"
                  onMouseDown={rememberCaret}
                  onClick={() => placeButton("left")}
                >
                  <AlignLeft className="size-4" />
                </BlockChoice>
                <BlockChoice
                  label="Center"
                  onMouseDown={rememberCaret}
                  onClick={() => placeButton("center")}
                >
                  <AlignCenter className="size-4" />
                </BlockChoice>
                <BlockChoice
                  label="Right"
                  onMouseDown={rememberCaret}
                  onClick={() => placeButton("right")}
                >
                  <AlignRight className="size-4" />
                </BlockChoice>
                <p className={`px-2 pt-2 pb-1 ${KICKER}`}>
                  Table
                </p>
                <BlockChoice
                  label="2 columns"
                  onMouseDown={rememberCaret}
                  onClick={() => insert(TWO_COLUMNS)}
                >
                  <Columns2 className="size-4" />
                </BlockChoice>
                <BlockChoice
                  label="3 columns"
                  onMouseDown={rememberCaret}
                  onClick={() => insert(THREE_COLUMNS)}
                >
                  <Columns3 className="size-4" />
                </BlockChoice>
                <BlockChoice
                  label="4 columns"
                  onMouseDown={rememberCaret}
                  onClick={() => insert(FOUR_COLUMNS)}
                >
                  <Columns4 className="size-4" />
                </BlockChoice>
              </div>
            </div>
          ) : null}
        </div>
        <div
          className="relative"
          onMouseEnter={() => setVariableMenu(true)}
          onMouseLeave={() => setVariableMenu(false)}
        >
          <RailButton
            label="Variable"
            pressed={variableMenu || variableModal}
            onMouseDown={rememberCaret}
            onClick={() => setVariableMenu(true)}
          >
            <Braces className="size-4" />
          </RailButton>
          {variableMenu ? (
            <div className="absolute top-1/2 left-full z-30 -translate-y-1/2 pl-3">
              <div className="w-56 rounded-sm border border-neutral-200 bg-white p-1.5 text-neutral-950 shadow-lg">
                <VariableList
                  template={current}
                  onInsert={insertVariable}
                  onMouseDown={rememberCaret}
                />
                <button
                  type="button"
                  onMouseDown={(event) => {
                    rememberCaret();
                    event.preventDefault();
                  }}
                  onClick={() => {
                    setVariableMenu(false);
                    setVariableModal(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
                >
                  <Plus className="size-4" />
                  Create variable
                </button>
              </div>
            </div>
          ) : null}
        </div>
          </>
        ) : null}
        <RailButton label="HTML" pressed={showHtml} onClick={() => void toggleHtml()}>
          <CodeXml className="size-4" />
        </RailButton>
      </div>
      {previewHtml !== null
        ? createPortal(
            <PreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />,
            document.body,
          )
        : null}
      {variableModal
        ? createPortal(
            <VariableModal
              onClose={() => setVariableModal(false)}
              onCreate={saveVariable}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function BlockChoice({
  label,
  onClick,
  onMouseDown,
  children,
}: {
  label: string;
  onClick: () => void;
  onMouseDown: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        onMouseDown();
        event.preventDefault();
      }}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-neutral-950 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
    >
      {children}
      {label}
    </button>
  );
}

function HtmlCode({
  html,
  onChange,
}: {
  html: string;
  onChange: (value: string) => void;
}) {
  const [{ markup, stylesheet }, setParts] = useState(() => splitHtmlCss(html));

  function changeMarkup(markup: string) {
    setParts((parts) => ({ ...parts, markup }));
    onChange(joinHtmlCss(markup, stylesheet));
  }

  function changeStylesheet(stylesheet: string) {
    setParts((parts) => ({ ...parts, stylesheet }));
    onChange(joinHtmlCss(markup, stylesheet));
  }

  return (
    <div className="html-editor flex h-full min-h-0 flex-1 bg-white">
      <div className="w-20 shrink-0" aria-hidden="true" />
      <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
        <SourceEditor
          label="HTML"
          language="html"
          value={markup}
          onChange={changeMarkup}
        />
        <SourceEditor
          label="CSS"
          language="css"
          value={stylesheet}
          onChange={changeStylesheet}
          className="border-t border-neutral-200 md:border-t-0 md:border-l"
        />
      </div>
    </div>
  );
}

function SourceEditor({
  label,
  language,
  value,
  onChange,
  className = "",
}: {
  label: string;
  language: "html" | "css";
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <section className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
      <p className={`border-b border-neutral-200 px-6 py-3 ${KICKER}`}>{label}</p>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          theme="envoy"
          loading={
            <p className="px-6 py-4 text-sm text-neutral-400">Loading editor</p>
          }
          onChange={(next) => onChange(next ?? "")}
          onMount={(editor) => {
            const parent = editor.getDomNode()?.parentElement;
            if (!parent) return;
            const layout = () => {
              const box = parent.getBoundingClientRect();
              if (box.width < 20 || box.height < 20) return;
              editor.layout({ width: Math.floor(box.width), height: Math.floor(box.height) });
            };
            layout();
            const observer = new ResizeObserver(layout);
            observer.observe(parent);
            editor.onDidDispose(() => observer.disconnect());
          }}
          options={{
            automaticLayout: false,
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            lineHeight: 22,
            tabSize: 2,
            insertSpaces: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fixedOverflowWidgets: true,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
            glyphMargin: true,
            renderValidationDecorations: "on",
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            wordBasedSuggestions: "currentDocument",
            parameterHints: { enabled: true },
            hover: { enabled: "on" },
            formatOnPaste: true,
            formatOnType: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            tabCompletion: "on",
            snippetSuggestions: "inline",
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
            smoothScrolling: true,
            overviewRulerLanes: 2,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
        </div>
      </div>
    </section>
  );
}

function splitHtmlCss(source: string): { markup: string; stylesheet: string } {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const rules: string[] = [];
  doc.querySelectorAll("style").forEach((style) => {
    const text = style.textContent?.trim();
    if (text) rules.push(text);
    style.remove();
  });
  let index = 0;
  doc.body.querySelectorAll("[style]").forEach((element) => {
    const style = element.getAttribute("style")?.trim();
    if (!style) return;
    const className = `style-${index}`;
    index += 1;
    element.classList.add(className);
    element.removeAttribute("style");
    rules.push(`.${className} { ${style} }`);
  });
  return {
    markup: formatHtmlSource(doc.body.innerHTML),
    stylesheet: formatCss(rules.join("\n")),
  };
}

function joinHtmlCss(markup: string, stylesheet: string): string {
  const css = stylesheet.trim();
  const style = css ? `<style>\n${css}\n</style>` : "";
  return `<!DOCTYPE html><html><head>${style}</head><body>${markup}</body></html>`;
}

function formatCss(css: string): string {
  return css
    .replace(/\s*\{/g, " {\n  ")
    .replace(/;\s*/g, ";\n  ")
    .replace(/\s*\}/g, "\n}\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inlineStylesheet(doc: Document) {
  const rules: { selector: string; body: string }[] = [];
  doc.querySelectorAll("style").forEach((style) => {
    for (const match of (style.textContent ?? "").matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const selector = match[1]?.trim();
      const body = match[2]?.trim();
      if (selector && body) rules.push({ selector, body });
    }
  });
  for (const rule of rules) {
    for (const selector of rule.selector.split(",").map((item) => item.trim())) {
      if (!selector) continue;
      let nodes: NodeListOf<Element>;
      try {
        nodes = doc.querySelectorAll(selector);
      } catch {
        continue;
      }
      nodes.forEach((element) => {
        const current = element.getAttribute("style")?.trim() ?? "";
        const next = current
          ? `${current.replace(/;?\s*$/, ";")} ${rule.body.replace(/;?\s*$/, ";")}`
          : rule.body;
        element.setAttribute("style", next);
      });
    }
  }
}

function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "LI", "TR", "TABLE"]);
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    if (element.tagName === "BR") return "\n";
    const inner = [...element.childNodes].map(walk).join("");
    return blocks.has(element.tagName) ? `${inner}\n` : inner;
  }
  return walk(doc.body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function alignmentOf(element: Element): "left" | "center" | "right" {
  let current = element.parentElement;
  while (current && current.tagName !== "BODY") {
    const align = current.getAttribute("align")?.toLowerCase();
    if (align === "left" || align === "center" || align === "right") return align;
    const match = /text-align\s*:\s*(left|center|right)/i.exec(current.getAttribute("style") ?? "");
    if (match?.[1]) return match[1].toLowerCase() as "left" | "center" | "right";
    current = current.parentElement;
  }
  return "left";
}

function looksLikeButton(anchor: HTMLAnchorElement): boolean {
  if (anchor.getAttribute("data-id") === "react-email-button") return true;
  const style = anchor.getAttribute("style") ?? "";
  return /display\s*:\s*inline-block/i.test(style) && /background(?:-color)?\s*:/i.test(style);
}

function emailHtmlToEditorHtml(html: string): string {
  const source = html.trim();
  if (!source) return "<p></p>";
  const doc = new DOMParser().parseFromString(source, "text/html");
  inlineStylesheet(doc);
  doc.querySelectorAll("script, style, link, meta").forEach((node) => node.remove());
  const comments: Comment[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((comment) => comment.remove());

  doc.body.querySelectorAll("a").forEach((node) => {
    if (!(node instanceof HTMLAnchorElement) || !looksLikeButton(node)) return;
    const label = (node.textContent ?? "").replace(/[\u200B\u2060\u200A]/g, "").trim() || "Button";
    node.textContent = label;
    node.setAttribute("data-id", "react-email-button");
    node.setAttribute("alignment", alignmentOf(node));
    if (!node.getAttribute("href")) node.setAttribute("href", "#");
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const table of [...doc.body.querySelectorAll("table")]) {
      const rows = [
        ...table.querySelectorAll(":scope > tbody > tr, :scope > tr"),
      ];
      const cells = rows.flatMap((row) => [
        ...row.querySelectorAll(":scope > td, :scope > th"),
      ]);
      if (rows.length !== 1 || cells.length !== 1) continue;
      const cell = cells[0];
      if (!cell || !table.parentNode) continue;
      const fragment = doc.createDocumentFragment();
      while (cell.firstChild) fragment.appendChild(cell.firstChild);
      table.parentNode.replaceChild(fragment, table);
      changed = true;
      break;
    }
  }

  const content = doc.body.innerHTML.trim();
  return content || "<p></p>";
}

function formatHtmlSource(html: string): string {
  const lines = html.replace(/>\s*</g, ">\n<").trim().split("\n");
  let depth = 0;
  return lines
    .map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      const closes = /^<\/[^>]+>/.test(line);
      const selfClosing = /\/>$/.test(line);
      const paired = /^<[^>]+>[\s\S]*<\/[^>]+>$/.test(line);
      const opens = /^<[^/!][^>]*>/.test(line) && !selfClosing && !paired;
      if (closes) depth = Math.max(0, depth - 1);
      const indented = `${"  ".repeat(depth)}${line}`;
      if (opens) depth += 1;
      return indented;
    })
    .join("\n");
}

function MetaField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 py-1.5">
      <span className={`w-28 shrink-0 ${KICKER}`}>{label}</span>
      {children}
    </label>
  );
}

function RailButton({
  label,
  onClick,
  onMouseDown,
  pressed = false,
  children,
}: {
  label: string;
  onClick: () => void;
  onMouseDown?: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onMouseDown={(event) => {
        onMouseDown?.();
        event.preventDefault();
      }}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-sm transition-colors ${
        pressed
          ? "bg-[#0A4BD6] text-white"
          : "text-neutral-600 hover:bg-[#0A4BD6]/10 hover:text-[#0A4BD6]"
      }`}
    >
      {children}
    </button>
  );
}

function listedVariables(template: ConsoleTemplate): TemplateVariable[] {
  const known = new Set(template.variables.map((item) => item.name));
  const discovered = extractVariables(template)
    .filter((name) => !known.has(name))
    .map((name) => ({ name, type: "string" as const, fallback: "" }));
  return [...template.variables, ...discovered].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function VariableList({
  template,
  onInsert,
  onMouseDown,
}: {
  template: ConsoleTemplate;
  onInsert: (name: string) => void;
  onMouseDown: () => void;
}) {
  const variables = listedVariables(template);
  if (variables.length === 0) return null;
  return (
    <ul className="mb-1 max-h-52 overflow-auto border-b border-neutral-200 pb-1">
      {variables.map((variable) => (
        <li key={variable.name}>
          <button
            type="button"
            onMouseDown={(event) => {
              onMouseDown();
              event.preventDefault();
            }}
            onClick={() => onInsert(variable.name)}
            className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-neutral-950 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
          >
            <span className="truncate font-mono text-sm">{`{{ ${variable.name} }}`}</span>
            <span className={KICKER}>
              {VARIABLE_TYPES.find((item) => item.id === variable.type)?.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PreviewModal({
  html,
  onClose,
}: {
  html: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        className={`flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
              Template
            </p>
            <h2
              id="template-preview-title"
              className="mt-1 text-xl font-semibold tracking-tight"
            >
              Preview
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <iframe
          title="Template preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
          className="min-h-[70vh] w-full flex-1 bg-white"
        />
      </div>
    </div>
  );
}

function VariableModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (variable: TemplateVariable) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<VariableType>("string");
  const [fallback, setFallback] = useState("");
  const parsed = variableToken(name);

  function submit() {
    if (!parsed) return;
    onCreate({
      name: parsed.slice(2, -2),
      type,
      fallback: fallback.trim(),
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-variable-title"
        className={`w-full max-w-lg rounded-t-sm sm:rounded-sm ${PORTAL_SURFACE}`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-[#0A4BD6] uppercase">
              Variable
            </p>
            <h2
              id="create-variable-title"
              className="mt-1 text-xl font-semibold tracking-tight text-neutral-950"
            >
              Create variable
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Insert a placeholder the send API can fill in.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-neutral-200 text-neutral-500 transition-colors hover:border-[#0A4BD6]/30 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <label className="block">
            <span className={`mb-2 block ${KICKER}`}>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="{{ YOUR_VARIABLE }}"
              aria-label="Name"
              className={`${FIELD_COMPACT} font-mono`}
            />
          </label>
          <label className="block">
            <span className={`mb-2 block ${KICKER}`}>Type</span>
            <span className="relative block">
              <select
                value={type}
                onChange={(event) => setType(event.target.value as VariableType)}
                aria-label="Type"
                className={`${FIELD_COMPACT} appearance-none pr-10`}
              >
                {VARIABLE_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-neutral-400" />
            </span>
          </label>
          <label className="block">
            <span className={`mb-2 block ${KICKER}`}>Fallback value</span>
            <input
              value={fallback}
              onChange={(event) => setFallback(event.target.value)}
              placeholder="Value that appears if the variable is empty"
              aria-label="Fallback value"
              className={FIELD_COMPACT}
            />
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={!parsed}>
            Create variable
          </button>
        </div>
      </form>
    </div>
  );
}

function variableToken(rawName: string): string | null {
  const name = rawName.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null;
  return `{{${name}}}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

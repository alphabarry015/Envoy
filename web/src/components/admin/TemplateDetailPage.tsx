import "@react-email/editor/themes/default.css";

import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import type { Content, Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { useCurrentEditor, useEditorState } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import type { DragHandleRule } from "@tiptap/extension-drag-handle";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
  BubbleMenu,
  BubbleMenuAlignCenter,
  BubbleMenuAlignLeft,
  BubbleMenuAlignRight,
  BubbleMenuBold,
  BubbleMenuCode,
  BubbleMenuItalic,
  BubbleMenuItemGroup,
  BubbleMenuLinkSelector,
  BubbleMenuNodeSelector,
  BubbleMenuStrike,
  BubbleMenuUnderline,
  BubbleMenuUppercase,
  FOUR_COLUMNS,
  TEXT,
  THREE_COLUMNS,
  TWO_COLUMNS,
  type SlashCommandItem,
  type TriggerParams,
} from "@react-email/editor/ui";
import MonacoEditor from "@monaco-editor/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  CodeXml,
  Columns2,
  Columns3,
  Columns4,
  GripVertical,
  Image,
  Link2,
  Plus,
  Unlink,
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
  fetchTemplate,
  slugAlias,
  updateRemoteTemplate,
} from "../../lib/templates";
import { PageLoading } from "../ui/ScanLoading";

const VARIABLE_TYPES: { id: VariableType; label: string }[] = [
  { id: "string", label: "String" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
];

const COLUMN_GROUPS = new Set(["twoColumns", "threeColumns", "fourColumns"]);

const columnDropKey = new PluginKey("envoyColumnDrop");
const dragHandleHoldKey = new PluginKey("envoyDragHandleHold");

type ViewDesc = { node?: { type: { name: string } }; posBefore?: number };

function nodePos(view: EditorView, anchor: HTMLElement, typeName: string): number | null {
  let current: HTMLElement | null = anchor;
  while (current && current !== view.dom) {
    const desc = (current as HTMLElement & { pmViewDesc?: ViewDesc }).pmViewDesc;
    if (desc?.node?.type.name === typeName && typeof desc.posBefore === "number") return desc.posBefore;
    current = current.parentElement;
  }
  return null;
}

function posInside(view: EditorView, containerPos: number, pos: number) {
  const node = view.state.doc.nodeAt(containerPos);
  return Boolean(node && pos > containerPos && pos < containerPos + node.nodeSize);
}

function columnUnderPointer(view: EditorView, event: DragEvent): number | null {
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const direct = hit instanceof Element ? hit.closest(".node-column") : null;
  if (direct instanceof HTMLElement) {
    const pos = nodePos(view, direct, "columnsColumn");
    if (pos != null) return pos;
  }
  let best: { pos: number; dist: number } | null = null;
  for (const node of view.dom.querySelectorAll(".node-column")) {
    if (!(node instanceof HTMLElement)) continue;
    const box = node.getBoundingClientRect();
    if (event.clientY < box.top || event.clientY > box.bottom) continue;
    const dist =
      event.clientX < box.left ? box.left - event.clientX : event.clientX > box.right ? event.clientX - box.right : 0;
    const pos = nodePos(view, node, "columnsColumn");
    if (pos == null) continue;
    if (!best || dist < best.dist) best = { pos, dist };
  }
  return best && best.dist <= 28 ? best.pos : null;
}

function columnDepth(view: EditorView, pos: number) {
  const resolved = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
  let depth = 0;
  for (let level = resolved.depth; level > 0; level -= 1) {
    if (COLUMN_GROUPS.has(resolved.node(level).type.name)) depth += 1;
  }
  return depth;
}

function moveIntoColumn(view: EditorView, columnPos: number) {
  const dragging = view.dragging as { node?: NodeSelection } | null;
  const block = dragging?.node?.node;
  if (!dragging?.node || !block) return false;
  if (COLUMN_GROUPS.has(block.type.name) && columnDepth(view, columnPos) >= 3) return false;
  const source = dragging.node;
  const tr = view.state.tr;
  const parent = tr.doc.resolve(source.from).parent;
  if (parent.type.name === "columnsColumn" && parent.childCount === 1) {
    tr.replaceWith(source.from, source.to, tr.doc.type.schema.nodes.paragraph.create());
  } else {
    source.replace(tr);
  }
  const mapped = tr.mapping.map(columnPos);
  const column = tr.doc.nodeAt(mapped);
  if (!column || column.type.name !== "columnsColumn") return false;
  const start = mapped + 1;
  const end = mapped + column.nodeSize - 1;
  const empty =
    column.childCount === 1 && column.firstChild?.isTextblock === true && column.firstChild.content.size === 0;
  if (empty) tr.replaceWith(start, end, block);
  else tr.insert(end, block);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function alignDraggedButton(view: EditorView, event: DragEvent) {
  const dragging = view.dragging as { node?: NodeSelection } | null;
  const selection = dragging?.node;
  if (!selection || selection.node.type.name !== "button") return false;
  const dom = view.nodeDOM(selection.from);
  if (!(dom instanceof HTMLElement)) return false;
  const link = dom.querySelector(".node-button");
  const box = (link instanceof HTMLElement ? link : dom).getBoundingClientRect();
  if (event.clientY < box.top - 12 || event.clientY > box.bottom + 12) return false;
  const container = dom.closest(".node-column") ?? view.dom;
  const bounds = container.getBoundingClientRect();
  if (bounds.width <= 0) return false;
  const ratio = (event.clientX - bounds.left) / bounds.width;
  const alignment = ratio < 1 / 3 ? "left" : ratio > 2 / 3 ? "right" : "center";
  if (selection.node.attrs.alignment === alignment) return false;
  view.dispatch(view.state.tr.setNodeAttribute(selection.from, "alignment", alignment));
  return true;
}

function dragHandleHoldPlugin() {
  return new Plugin({
    key: dragHandleHoldKey,
    view(editorView) {
      const onLeave = (event: globalThis.MouseEvent) => {
        const handle = editorView.dom.parentElement?.querySelector(".envoy-drag-handle");
        if (!(handle instanceof HTMLElement) || handle.style.visibility === "hidden") return;
        const next = event.relatedTarget;
        const onto = next instanceof Element && Boolean(next.closest(".envoy-drag-handle"));
        const box = handle.getBoundingClientRect();
        const near =
          event.clientX >= box.left - 12 &&
          event.clientX <= box.right + 28 &&
          event.clientY >= box.top - 12 &&
          event.clientY <= box.bottom + 12;
        if (onto || near) event.stopImmediatePropagation();
      };
      editorView.dom.addEventListener("mouseleave", onLeave, true);
      return {
        destroy() {
          editorView.dom.removeEventListener("mouseleave", onLeave, true);
        },
      };
    },
  });
}

function columnDropPlugin() {
  return new Plugin({
    key: columnDropKey,
    props: {
      handleDrop(view, event) {
        const dragging = view.dragging as { node?: NodeSelection } | null;
        const source = dragging?.node;
        if (!source) return false;
        const columnPos = columnUnderPointer(view, event);
        if (
          columnPos != null &&
          !posInside(view, source.from, columnPos) &&
          !posInside(view, columnPos, source.from)
        ) {
          const pointed = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pointed && posInside(view, columnPos, pointed.pos)) return false;
          return moveIntoColumn(view, columnPos);
        }
        return alignDraggedButton(view, event);
      },
    },
  });
}

const textMenuKey = new PluginKey("envoyTextMenu");

function showFormatMenu({ editor, state }: TriggerParams) {
  if (editor.isActive("image") || editor.isActive("horizontalRule")) return false;
  if (editor.isActive("button")) return true;
  if (state.selection instanceof NodeSelection) return false;
  return state.selection.content().size > 0;
}

function linkValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "#") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:") {
      return trimmed;
    }
    return null;
  } catch {
    if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
    return null;
  }
}

function ButtonHrefControl() {
  const { editor } = useCurrentEditor();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const href =
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        const raw = current?.getAttributes("button").href ?? "";
        return raw === "#" ? "" : String(raw);
      },
    }) ?? "";

  useEffect(() => {
    if (open) setValue(href);
  }, [open, href]);

  if (!editor) return null;

  function apply(next: string) {
    editor?.chain().focus().updateAttributes("button", { href: next || "#" }).run();
    setOpen(false);
  }

  return (
    <div
      data-re-link-selector=""
      {...(open ? { "data-open": "" } : {})}
      {...(href ? { "data-has-link": "" } : {})}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Add link"
        aria-pressed={Boolean(href)}
        data-re-link-selector-trigger=""
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <Link2 aria-hidden="true" />
      </button>
      {open ? (
        <form
          data-re-link-selector-form=""
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            apply(linkValue(value) ?? "");
          }}
        >
          <input
            data-re-link-selector-input=""
            value={value}
            placeholder="Paste a link"
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.stopPropagation()}
          />
          {href ? (
            <button
              type="button"
              aria-label="Remove link"
              data-re-link-selector-unlink=""
              onClick={() => apply("")}
            >
              <Unlink aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" aria-label="Apply link" data-re-link-selector-apply="">
              <Check aria-hidden="true" />
            </button>
          )}
        </form>
      ) : null}
    </div>
  );
}

function MenuLink() {
  const { editor } = useCurrentEditor();
  const onButton = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isActive("button") ?? false,
  });
  if (onButton) return <ButtonHrefControl />;
  return <BubbleMenuLinkSelector />;
}

function FormatMenu() {
  const { editor } = useCurrentEditor();
  const code = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isActive("code") ?? false,
  });
  if (code) {
    return (
      <>
        <BubbleMenuNodeSelector />
        <BubbleMenuCode />
      </>
    );
  }
  return (
    <>
      <BubbleMenuNodeSelector />
      <MenuLink />
      <BubbleMenuItemGroup>
        <BubbleMenuBold />
        <BubbleMenuItalic />
        <BubbleMenuUnderline />
        <BubbleMenuStrike />
        <BubbleMenuCode />
        <BubbleMenuUppercase />
      </BubbleMenuItemGroup>
      <BubbleMenuItemGroup>
        <BubbleMenuAlignLeft />
        <BubbleMenuAlignCenter />
        <BubbleMenuAlignRight />
      </BubbleMenuItemGroup>
    </>
  );
}

const COLUMN_DRAG_RULES: DragHandleRule[] = [
  {
    id: "skipColumnCell",
    evaluate: ({ node }) => (node.type.name === "columnsColumn" ? 1000 : 0),
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
  const [template, setTemplate] = useState<ConsoleTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const buttonAnchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTemplate(null);
    setEmpty(true);
    setShowHtml(false);
    setHtmlDraft("");
    setDirty(false);
    setPreviewHtml(null);
    savedDocument.current = null;
    setVariableMenu(false);
    setVariableModal(false);
    setBlockMenu(false);
    fetchTemplate(templateId)
      .then((row) => {
        if (!cancelled) setTemplate(row);
      })
      .catch(() => {
        if (!cancelled) setTemplate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (loading) return <PageLoading>Loading template</PageLoading>;
  if (!template) {
    return <Navigate to="/console/templates" replace />;
  }

  const current = template;
  const initialContent = (current.document ?? emailHtmlToEditorHtml(current.html)) as Content;

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
    if (target.closest("input, textarea, button, a, .envoy-drag-handle")) return;
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

  async function saveVariable(variable: TemplateVariable) {
    const variables = [
      ...current.variables.filter((item) => item.name !== variable.name),
      variable,
    ].sort((left, right) => left.name.localeCompare(right.name));
    const next = { ...current, variables, updatedAt: new Date().toISOString() };
    setSaveError(null);
    try {
      const saved = await updateRemoteTemplate(next);
      setTemplate(saved);
      insertVariable(variable.name);
      setVariableModal(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this variable.");
    }
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
    setSaveError(null);
    try {
      const saved = await updateRemoteTemplate(nextTemplate);
      if (editor) savedDocument.current = JSON.stringify(editor.getJSON());
      setTemplate(saved);
      setDirty(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this template.");
    }
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
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-3 py-3 text-neutral-950 sm:px-5">
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
        <div className="flex min-w-0 flex-1 items-center text-sm">
          <Link to="/console/templates" className="shrink-0 text-neutral-500 hover:text-[#0A4BD6]">
            Templates
          </Link>
          <span className="px-1.5 text-neutral-300">/</span>
          <input
            value={current.name}
            onChange={(event) => update({ name: event.target.value })}
            aria-label="Template name"
            size={Math.max((current.name || "Untitled").length, 1)}
            className="max-w-[9rem] min-w-0 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400 sm:max-w-56 [field-sizing:content]"
            placeholder="Untitled"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
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
      {saveError ? (
        <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">{saveError}</p>
      ) : null}

      {showHtml ? (
        <HtmlCode
          name={current.alias || current.name}
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
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-white">
          <div className="pointer-events-auto mx-auto w-full max-w-[600px] px-4 pt-6 sm:px-0 sm:pt-8">
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
            if (!editor.state.plugins.some((plugin) => plugin.spec.key === columnDropKey)) {
              editor.registerPlugin(columnDropPlugin());
            }
            if (!editor.state.plugins.some((plugin) => plugin.spec.key === dragHandleHoldKey)) {
              editor.registerPlugin(dragHandleHoldPlugin());
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
          <BubbleMenu className="envoy-text-menu" pluginKey={textMenuKey} trigger={showFormatMenu}>
            <FormatMenu />
          </BubbleMenu>
          {dragEditor && dragEditor.id === current.id && !showHtml ? (
            <DragHandle
              editor={dragEditor.editor}
              className="envoy-drag-handle"
              nested={{
                edgeDetection: "none",
                rules: COLUMN_DRAG_RULES,
              }}
              onNodeChange={({ editor, node, pos }) => {
                if (node?.type.name !== "button" || pos < 0) {
                  buttonAnchorRef.current = null;
                  return;
                }
                const dom = editor.view.nodeDOM(pos);
                const link = dom instanceof HTMLElement ? dom.querySelector(".node-button") : null;
                buttonAnchorRef.current = link instanceof HTMLElement ? link : null;
              }}
              getReferencedVirtualElement={() => {
                const link = buttonAnchorRef.current;
                if (!link) return null;
                return {
                  getBoundingClientRect() {
                    const box = link.getBoundingClientRect();
                    const grip = 28;
                    const top = box.top + Math.max(0, (box.height - grip) / 2);
                    return new DOMRect(box.left, top, 0, grip);
                  },
                };
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
  name,
  html,
  onChange,
}: {
  name: string;
  html: string;
  onChange: (value: string) => void;
}) {
  const fileName = slugAlias(name) || "template";
  const [{ markup, stylesheet }, setParts] = useState(() => splitHtmlCss(html));
  const partsRef = useRef({ markup, stylesheet });
  const [file, setFile] = useState<"html" | "css">("html");

  function changeMarkup(markup: string) {
    const next = { ...partsRef.current, markup };
    partsRef.current = next;
    setParts(next);
    onChange(joinHtmlCss(next.markup, next.stylesheet));
  }

  function changeStylesheet(stylesheet: string) {
    const next = { ...partsRef.current, stylesheet };
    partsRef.current = next;
    setParts(next);
    onChange(joinHtmlCss(next.markup, next.stylesheet));
  }

  return (
    <div className="html-editor flex h-full min-h-0 flex-1 bg-white">
      <div className="w-20 shrink-0" aria-hidden="true" />
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 py-3">
        <p className="px-3 pb-2 font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
          {fileName}
        </p>
        <FileRow
          label={`${fileName}.html`}
          pressed={file === "html"}
          onClick={() => setFile("html")}
        />
        <FileRow
          label={`${fileName}.css`}
          pressed={file === "css"}
          onClick={() => setFile("css")}
        />
      </aside>
      <SourceEditor
        key={file}
        language={file === "html" ? "html" : "css"}
        value={file === "html" ? markup : stylesheet}
        onChange={file === "html" ? changeMarkup : changeStylesheet}
      />
    </div>
  );
}

function FileRow({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`mx-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs ${
        pressed
          ? "bg-[#0A4BD6]/10 text-[#0A4BD6]"
          : "text-neutral-600 hover:bg-[#0A4BD6]/5 hover:text-[#0A4BD6]"
      }`}
    >
      {label}
    </button>
  );
}

function SourceEditor({
  language,
  value,
  onChange,
}: {
  language: "html" | "css";
  value: string;
  onChange: (value: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={frameRef} className="min-h-0 flex-1">
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
            const frame = frameRef.current;
            if (!frame) return;
            const layout = () => {
              const box = frame.getBoundingClientRect();
              if (box.width < 20 || box.height < 20) return;
              editor.layout({
                width: Math.floor(box.width),
                height: Math.floor(box.height),
              });
            };
            layout();
            requestAnimationFrame(layout);
            const observer = new ResizeObserver(layout);
            observer.observe(frame);
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
            wordWrap: "off",
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            padding: { top: 12, bottom: 12 },
            glyphMargin: false,
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
            guides: { bracketPairs: true, indentation: true },
            smoothScrolling: true,
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          }}
        />
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
  const markup = formatHtmlSource(doc.body.innerHTML);
  const used = new Set(
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]?.split(/\s+/) ?? []),
  );
  const stylesheet = rules.filter((rule) => {
    const selector = /^\.style-\d+\s*\{/.exec(rule)?.[0];
    if (!selector) return true;
    const className = selector.slice(1, selector.indexOf(" "));
    return used.has(className);
  });
  return {
    markup,
    stylesheet: formatCss(stylesheet.join("\n")),
  };
}

function joinHtmlCss(markup: string, stylesheet: string): string {
  const css = stylesheet.trim();
  const style = css ? `<style>\n${css}\n</style>` : "";
  return `<!DOCTYPE html><html><head>${style}</head><body>${markup}</body></html>`;
}

function formatCss(css: string): string {
  const compact = css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
  let out = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < compact.length; index += 1) {
    const char = compact[index]!;
    if (quote) {
      out += char;
      if (char === "\\" && compact[index + 1]) {
        out += compact[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "{") {
      out = `${out.trimEnd()} {\n${"  ".repeat(depth + 1)}`;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
      out = `${out.trimEnd()}\n${"  ".repeat(depth)}}\n`;
      if (depth > 0) out += "  ".repeat(depth);
      continue;
    }
    if (char === ";") {
      out = `${out.trimEnd()};\n${"  ".repeat(depth)}`;
      continue;
    }
    out += char;
  }
  return `${out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** Drop @media and @font-face so mobile-only rules are not applied in the editor. */
function stripAtRules(css: string): string {
  let out = "";
  let index = 0;
  while (index < css.length) {
    if (css[index] !== "@") {
      out += css[index];
      index += 1;
      continue;
    }
    const open = css.indexOf("{", index);
    if (open === -1) break;
    let depth = 0;
    let cursor = open;
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") {
        depth -= 1;
        if (depth === 0) {
          cursor += 1;
          break;
        }
      }
    }
    index = cursor;
  }
  return out;
}

function inlineStylesheet(doc: Document) {
  const rules: { selector: string; body: string }[] = [];
  doc.querySelectorAll("style").forEach((style) => {
    const css = stripAtRules(style.textContent ?? "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
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

function iconImage(cell: Element): HTMLImageElement | null {
  const images = [...cell.querySelectorAll("img")].filter(
    (node): node is HTMLImageElement => node instanceof HTMLImageElement,
  );
  if (images.length !== 1) return null;
  const image = images[0];
  if (!image) return null;
  if ((cell.textContent ?? "").replace(/\s+/g, "") !== "") return null;
  const width = Number(image.getAttribute("width") ?? "");
  const height = Number(image.getAttribute("height") ?? "");
  const small = (width > 0 && width <= 96) || (height > 0 && height <= 96);
  return small ? image : null;
}

/** A row of social logos must stay on one line. The editor otherwise stacks block images. */
function flattenIconRows(doc: Document) {
  for (const table of [...doc.body.querySelectorAll("table")]) {
    const rows = [...table.querySelectorAll(":scope > tbody > tr, :scope > tr")];
    if (rows.length !== 1) continue;
    const cells = [...(rows[0]?.querySelectorAll(":scope > td, :scope > th") ?? [])];
    if (cells.length < 2) continue;
    const images = cells.map((cell) => iconImage(cell));
    if (images.some((image) => !image)) continue;
    const row = doc.createElement("div");
    row.className = "envoy-icon-row";
    for (const image of images) {
      if (!image) continue;
      const link = image.closest("a");
      const href = link?.getAttribute("href");
      if (href && href !== "#") image.setAttribute("href", href);
      row.appendChild(image);
    }
    table.replaceWith(row);
  }
}

function emailHtmlToEditorHtml(html: string): string {
  const source = html.trim();
  if (!source) return "<p></p>";
  const doc = new DOMParser().parseFromString(source, "text/html");
  inlineStylesheet(doc);
  flattenIconRows(doc);
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

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** Preview padding and bidi marks. They are not readable text. */
const INVISIBLE_CHARS =
  /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

function visibleText(value: string): string {
  return value.replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim();
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeHtml(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = visibleText(node.textContent ?? "");
    return text ? `${"  ".repeat(depth)}${escapeHtmlText(text)}\n` : "";
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    const text = visibleText(node.textContent ?? "");
    if (!text || text === "$" || text === "/$" || text === "html" || text === "head" || text === "body") {
      return "";
    }
    return `${"  ".repeat(depth)}<!-- ${text} -->\n`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (element.tagName === "BODY") {
    return [...element.childNodes].map((child) => serializeHtml(child, depth)).join("");
  }
  if (element.getAttribute("data-skip-in-text") === "true") return "";
  const tag = element.tagName.toLowerCase();
  const attrs = [...element.attributes]
    .filter((attr) => attr.name !== "data-skip-in-text")
    .map((attr) => ` ${attr.name}="${escapeHtmlText(attr.value).replace(/"/g, "&quot;")}"`)
    .join("");
  const pad = "  ".repeat(depth);
  if (element.classList.contains("envoy-icon-row")) {
    const icons = [...element.children]
      .map((child) => serializeHtml(child, 0).trim())
      .filter(Boolean)
      .join("");
    return icons ? `${pad}<${tag}${attrs}>${icons}</${tag}>\n` : "";
  }
  if (VOID_TAGS.has(tag)) return `${pad}<${tag}${attrs}>\n`;
  const children = [...element.childNodes];
  const onlyText = children.every((child) => child.nodeType === Node.TEXT_NODE);
  if (onlyText) {
    const text = visibleText(children.map((child) => child.textContent ?? "").join(""));
    return text ? `${pad}<${tag}${attrs}>${escapeHtmlText(text)}</${tag}>\n` : "";
  }
  const inner = children.map((child) => serializeHtml(child, depth + 1)).join("");
  if (!inner.trim()) return "";
  return `${pad}<${tag}${attrs}>\n${inner}${pad}</${tag}>\n`;
}

function formatHtmlSource(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return serializeHtml(doc.body, 0).trim();
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

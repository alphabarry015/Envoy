import { ArrowLeft, Menu, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Link } from "react-router-dom";

import {
  DOC_NAV as NAV,
  DOC_SAMPLES as SAMPLES,
  DOC_SECTIONS as SECTIONS,
  type DocId,
  type DocLang as Lang,
} from "../lib/docsContent";

const LANGS: Array<{ id: Lang; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python httpx" },
  { id: "node", label: "Node.js fetch" },
];

const HANDLE =
  "relative w-1.5 shrink-0 bg-white/10 transition-colors outline-none hover:bg-white/35 focus-visible:bg-white/40 data-[separator]:bg-white/10 data-[separator][data-active]:bg-white/45";

export default function DocsPage() {
  const [section, setSection] = useState<DocId>("getting-started");
  const [lang, setLang] = useState<Lang>("curl");
  const [menuOpen, setMenuOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const content = SECTIONS[section];
  const sample = useMemo(() => SAMPLES[section][lang], [section, lang]);
  const sectionLabel = NAV.find((item) => item.id === section)?.label ?? "Docs";

  const nav = (
    <aside className="flex h-full min-h-0 flex-col bg-white/5 px-4 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-8">
      <Link
        to="/"
        className="group mb-6 flex shrink-0 items-center overflow-hidden rounded-sm border border-white/10 px-3 py-2.5 transition-colors hover:border-white/25 hover:bg-white/10"
      >
        <span className="relative flex min-h-5 w-full items-center">
          <span className="flex items-center gap-2.5 transition-all duration-200 group-hover:-translate-y-full group-hover:opacity-0">
            <span className="inline-block size-2 shrink-0 bg-white" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-[0.18em] text-white">ENVOY</span>
          </span>
          <span className="absolute inset-0 flex translate-y-full items-center gap-2 text-sm font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            Retour
          </span>
        </span>
      </Link>

      <p className="mb-4 shrink-0 font-mono text-[11px] tracking-widest text-white/45 uppercase">
        Documentation
      </p>
      <nav aria-label="Docs" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              setMenuOpen(false);
              setSamplesOpen(false);
            }}
            className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition-colors ${
              section === item.id
                ? "bg-white text-[#0A4BD6]"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );

  const article = (
    <article className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-5 md:px-10 md:py-12 lg:px-12">
      <p className="mb-4 font-mono text-xs tracking-widest text-white/50 uppercase">
        <span aria-hidden="true">■ </span>
        {content.kicker}
      </p>
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
        {content.title}
      </h1>
      <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/80">{content.lead}</p>
      <div className="mt-10 max-w-3xl space-y-10">
        {content.blocks.map((block) => (
          <section key={block.heading}>
            <h2 className="text-lg font-semibold tracking-tight text-white md:text-xl">
              {block.heading}
            </h2>
            {block.paragraphs ? (
              <div className="mt-3 space-y-4 text-base leading-relaxed text-white/70">
                {block.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            ) : null}
            {block.items ? (
              <ul className="mt-3 space-y-2 text-base leading-relaxed text-white/70">
                {block.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-white/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {block.rows ? (
              <dl className="mt-4 divide-y divide-white/10 rounded-sm border border-white/10">
                {block.rows.map(([term, detail]) => (
                  <div key={term} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
                    <dt className="font-mono text-xs leading-6 break-words text-[#9ec4ff]">{term}</dt>
                    <dd className="text-sm leading-6 text-white/75">{detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {block.code ? (
              <pre className="mt-4 overflow-x-auto rounded-sm border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-[#9ec4ff]">
                <code>{block.code}</code>
              </pre>
            ) : null}
          </section>
        ))}
      </div>
      <ul className="mt-8 max-w-3xl space-y-2">
        {content.bullets.map((bullet) => (
          <li
            key={bullet}
            className="rounded-sm border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-[#9ec4ff]"
          >
            {bullet}
          </li>
        ))}
      </ul>
    </article>
  );

  const samples = (
    <aside className="flex min-h-0 flex-col overflow-hidden bg-white/5 lg:h-full">
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 p-3">
        {LANGS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLang(item.id)}
            className={`rounded-sm px-3 py-1.5 text-xs transition-colors ${
              lang === item.id
                ? "bg-white text-[#0A4BD6]"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-4 py-5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#9ec4ff] sm:px-5">
        <code>{sample}</code>
      </pre>
    </aside>
  );

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white">
      <div className="relative z-10 flex h-full min-h-0 flex-col lg:hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-sm border border-white/15 text-white"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span className="sr-only">Open documentation menu</span>
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{sectionLabel}</p>
          <button
            type="button"
            className="rounded-sm border border-white/15 px-3 py-2 text-xs font-medium text-white"
            aria-pressed={samplesOpen}
            onClick={() => setSamplesOpen((open) => !open)}
          >
            {samplesOpen ? "Article" : "Examples"}
          </button>
        </header>
        {menuOpen ? (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-[#06245f]/50"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative flex h-full w-[min(18rem,88vw)] flex-col bg-[#0A4BD6]">
              <div className="flex justify-end px-2 pt-2">
                <button
                  type="button"
                  aria-label="Close menu"
                  className="inline-flex size-10 items-center justify-center text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{nav}</div>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">{samplesOpen ? samples : article}</div>
      </div>

      <div className="relative z-10 hidden h-full w-full lg:flex">
        <div className="h-full w-60 shrink-0 border-r border-white/10">{nav}</div>
        <Group
          id="docs-layout"
          orientation="horizontal"
          className="h-full min-w-0 flex-1"
        >
          <Panel id="docs-content" minSize={320} className="h-full min-w-0">
            {article}
          </Panel>
          <Separator className={HANDLE} />
          <Panel
            id="docs-samples"
            defaultSize={360}
            minSize={220}
            maxSize="55%"
            collapsible
            collapsedSize={0}
            className="h-full border-l border-white/10"
          >
            {samples}
          </Panel>
        </Group>
      </div>
    </main>
  );
}

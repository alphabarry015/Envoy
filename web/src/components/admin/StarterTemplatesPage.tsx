import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BTN_PRIMARY } from "../../lib/consoleUi";
import { STARTER_TEMPLATES, type StarterTemplate } from "../../lib/starterTemplates";
import { createTemplate, readStoredTemplates, writeStoredTemplates } from "../../lib/templates";

function EmailPreview({ title, html }: { title: string; html: string }) {
  return (
    <div className="h-[32rem] overflow-hidden bg-[#F3F4F6]">
      <iframe
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        className="h-full w-full border-0 bg-[#F3F4F6]"
      />
    </div>
  );
}

export default function StarterTemplatesPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  function useStarter(starter: StarterTemplate) {
    const existing = readStoredTemplates();
    const taken = existing.map((template) => template.alias);
    let alias = starter.alias;
    let suffix = 2;
    while (taken.includes(alias)) {
      alias = `${starter.alias}-${suffix}`;
      suffix += 1;
    }
    const template = {
      ...createTemplate(starter.name, alias),
      subject: starter.subject,
      previewText: starter.subject,
      html: starter.html,
      text: starter.subject,
    };
    const saved = writeStoredTemplates([template, ...existing]);
    if (!saved) {
      setError("This browser could not store the template.");
      return;
    }
    navigate(`/console/templates/${template.id}`);
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      {STARTER_TEMPLATES.map((starter) => (
        <article
          key={starter.id}
          className="overflow-hidden rounded-sm border border-neutral-200 bg-white"
        >
          <EmailPreview title={starter.name} html={starter.html} />
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-neutral-950">{starter.name}</p>
              <p className="truncate font-mono text-[11px] text-neutral-400">{starter.subject}</p>
            </div>
            <button type="button" className={BTN_PRIMARY} onClick={() => useStarter(starter)}>
              Use
            </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

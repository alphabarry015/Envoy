import MonacoEditor from "@monaco-editor/react";
import { useRef } from "react";

import "../../lib/monacoSetup";

export default function TemplateSourceEditor({
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

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import { cssDefaults } from "monaco-editor/esm/vs/language/css/monaco.contribution";
import { htmlDefaults } from "monaco-editor/esm/vs/language/html/monaco.contribution";

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

htmlDefaults.setOptions({
  format: {
    tabSize: 2,
    insertSpaces: true,
    wrapLineLength: 120,
    wrapAttributes: "auto",
  },
  suggest: { html5: true },
  data: { useDefaultDataProvider: true },
});

cssDefaults.setDiagnosticsOptions({
  validate: true,
  lint: {
    compatibleVendorPrefixes: "ignore",
    vendorPrefix: "warning",
    duplicateProperties: "warning",
    emptyRules: "warning",
    unknownProperties: "warning",
    hexColorLength: "error",
    argumentsInColorFunction: "error",
  },
  data: { useDefaultDataProvider: true },
  format: {
    newlineBetweenSelectors: true,
    newlineBetweenRules: true,
    spaceAroundSelectorSeparator: false,
    braceStyle: "collapse",
    preserveNewLines: true,
  },
});

monaco.editor.defineTheme("envoy", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "tag", foreground: "0A4BD6" },
    { token: "metatag", foreground: "0A4BD6" },
    { token: "attribute.name", foreground: "525252" },
    { token: "attribute.value", foreground: "0842BC" },
    { token: "string", foreground: "0842BC" },
    { token: "keyword", foreground: "0A4BD6" },
    { token: "number", foreground: "0842BC" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#0a0a0a",
    "editor.lineHighlightBackground": "#fafafa",
    "editorLineNumber.foreground": "#a3a3a3",
    "editorLineNumber.activeForeground": "#0a0a0a",
    "editor.selectionBackground": "#0A4BD626",
    "editorCursor.foreground": "#0a0a0a",
    "editorWidget.border": "#e5e5e5",
    "editorSuggestWidget.background": "#ffffff",
    "editorSuggestWidget.foreground": "#0a0a0a",
    "editorSuggestWidget.selectedBackground": "#0A4BD614",
    "editorError.foreground": "#dc2626",
    "editorWarning.foreground": "#d97706",
  },
});

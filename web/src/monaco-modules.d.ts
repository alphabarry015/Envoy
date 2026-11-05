declare module "monaco-editor/esm/vs/language/html/monaco.contribution" {
  export const htmlDefaults: {
    setOptions(options: {
      format?: {
        tabSize?: number;
        insertSpaces?: boolean;
        wrapLineLength?: number;
        wrapAttributes?: string;
      };
      suggest?: { html5?: boolean };
      data?: { useDefaultDataProvider?: boolean };
    }): void;
  };
}

declare module "monaco-editor/esm/vs/language/css/monaco.contribution" {
  export const cssDefaults: {
    setDiagnosticsOptions(options: {
      validate?: boolean;
      lint?: Record<string, string>;
      data?: { useDefaultDataProvider?: boolean };
      format?: Record<string, unknown>;
    }): void;
  };
}

declare module "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";

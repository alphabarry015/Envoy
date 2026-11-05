import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^monaco-editor\//,
        replacement: fileURLToPath(new URL("./node_modules/monaco-editor/", import.meta.url)),
      },
    ],
  },
  optimizeDeps: {
    exclude: ["monaco-editor"],
  },
  server: {
    port: 5173,
    host: true,
  },
});

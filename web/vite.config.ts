import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const notFoundWellKnown: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.startsWith("/.well-known/")) {
    res.statusCode = 404;
    res.end();
    return;
  }
  next();
};

function wellKnownNotFound(): Plugin {
  return {
    name: "envoy-well-known-404",
    configureServer(server) {
      server.middlewares.use(notFoundWellKnown);
    },
    configurePreviewServer(server) {
      server.middlewares.use(notFoundWellKnown);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), wellKnownNotFound()],
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

# Envoy Web (console + marketing UI)

Frontend Vite · React 19 · Tailwind 4 · React Router 7.

## Commands

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run test
npm run build
npm run preview
```

## Architecture (UI mock)

| Area | Path | Notes |
| --- | --- | --- |
| Marketing | `src/pages/HomePage.tsx`, `sections/*` | Cobalt landing |
| Docs | `src/pages/DocsPage.tsx` | Client-side docs shell |
| Console shell | `src/components/admin/AdminLayout.tsx` | Light theme, sidebar |
| Domains | `DomainsPanel`, `DomainDetailPage`, `lib/domains.ts` | localStorage mock |
| API keys | `ApiKeysPanel`, `lib/apiKeys.ts` | Secret shown once |
| Shared tokens | `lib/consoleUi.ts` | Buttons / fields / portals |
| Auth gate | `lib/auth.ts` | **Dev-only** sessionStorage |

Console data is **browser-local mock** until FastAPI endpoints are wired. Do not treat login or API keys as production security.

## Security notes (frontend)

- Auth accepts any non-empty email/password (UI exploration only).
- API key full secrets are never written to `localStorage` (prefix only).
- Portals/modals set `text-neutral-950` so they do not inherit `body { color: #fff }`.
- No `dangerouslySetInnerHTML` in the console UI.

## Performance

- Route-level `React.lazy` / `Suspense` for console & docs chunks.
- `FiberField` respects `prefers-reduced-motion`.
- Inter loaded via Google Fonts with `display=swap`.

## Tooling status

- `npm run build` / `typecheck` / `test` (13 unit tests) are green.
- Production dependencies: no known npm audit issues in the shipped bundle.
- Remaining `vitest` advisory (devDependency only) — upgrade blocked until Vitest 5 is compatible with this Vite 7 setup; does not ship in `dist/`.

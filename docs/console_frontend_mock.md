# Console frontend (mock) — état & limites

Document d’audit pour le frontend `web/` hors backend.

## Ce qui est en place

- Landing + docs + login (gate mock)
- Console : Overview (stub), Domains (complet mock), API Keys (complet mock)
- Stubs UI : Email Logs, Users & Invites, Suppression
- Persistance navigateur : `localStorage` (domains / api-keys), `sessionStorage` (session)

## Ce qui n’est PAS sécurisé / production

1. **Login** : n’importe quels identifiants non vides ouvrent la console.
2. **Pas de JWT**, pas d’invites, pas de RBAC serveur.
3. **DNS provider** : détection mock (NS fictifs), pas de lookup réseau.
4. **Verify DKIM** : timeout simulé, pas d’appel SES.
5. **Secrets API** : générés côté client pour la démo ; le backend devra hasher (SHA-256) et ne jamais renvoyer le secret.

## Organisation du code

```
web/src/
  components/admin/   # Shell + panels console
  components/sections/# Landing marketing
  components/ui/      # FiberField, ScanLoading, …
  lib/                # domains, apiKeys, auth, consoleUi, safeStorage
  pages/              # Routes top-level
```

Tokens UI partagés : `lib/consoleUi.ts` (boutons, champs, surfaces portal).

## Roadmap branchement API

1. Remplacer `lib/domains.ts` / `lib/apiKeys.ts` par clients `fetch` vers `/api/v1/*`
2. Remplacer `lib/auth.ts` par JWT + accept-invite
3. Brancher Logs / Users / Suppression sur les modèles PostgreSQL

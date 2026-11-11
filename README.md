# Envoy

Alternative auto-hébergée, souveraine et performante à Resend pour l'envoi d'e-mails transactionnels via **Amazon SES v2**.

Stack : **Python 3.11 · FastAPI · PostgreSQL 15 · SQLAlchemy 2.0 · Alembic · Docker · boto3**.

## Prérequis

- Docker Engine + Docker Compose v2
- Un compte AWS avec les droits SES v2 (`ses:CreateEmailIdentity`, `ses:GetEmailIdentity`, `ses:SendEmail`, …)

## Démarrage local (Docker Compose)

```bash
cp .env.example .env
```

Éditez `.env` : collez l'URI Postgres Supabase dans `DATABASE_URL` (session pooler ou connexion directe), les clés API Supabase, `SECRET_KEY`, puis l'e-mail et le mot de passe du premier admin (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`).

```bash
docker compose up --build
```

L'API écoute sur [http://localhost:8000](http://localhost:8000). Documentation OpenAPI : [http://localhost:8000/docs](http://localhost:8000/docs).

### Migrations Alembic

Dans un second terminal, une fois PostgreSQL healthy :

```bash
docker compose exec api alembic upgrade head
```

Créer une nouvelle révision après modification des modèles :

```bash
docker compose exec api alembic revision --autogenerate -m "description"
docker compose exec api alembic upgrade head
```

### Vérification

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

Arrêt :

```bash
docker compose down
```

Les données PostgreSQL persistent dans le volume Docker `envoy_postgres_data`. Pour tout réinitialiser : `docker compose down -v`.

## Endpoints v1

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/health` | Vivacité |
| `GET` | `/ready` | Ping PostgreSQL |
| `POST` | `/api/v1/domains` | Déclare un domaine et le relie aux outils choisis (SES, Resend, Brevo, Mailtrap) |
| `GET` | `/api/v1/domains/{id}/verify` | Re-synchronise les outils et revérifie le DNS en direct |
| `POST` | `/api/v1/send` | Envoi transactionnel (clé `envoy_live_…`), failover entre outils |
| `GET` | `/api/v1/providers` | Ordre d'envoi ; pour l'admin : consommation et état (`healthy`, `issues`) de chaque outil |
| `GET` | `/api/v1/overview` | Totaux depuis le début + activité récente paginée (`recent_page`, 10 par page) |
| `PATCH` | `/api/v1/auth/users/{id}` | Admin : rôle, quotas, et fin d'accès d'un membre actif (`access_expires_at`) |
| `POST` | `/api/v1/webhooks/{ses,resend,brevo,mailtrap}` | Événements de livraison (delivered, bounce, complaint) |

La documentation complète de l'API est servie par la console (`/docs`).

## Frontend (console UI mock)

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run test
npm run build
```

Détails : [`web/README.md`](web/README.md) · limites mock : [`docs/console_frontend_mock.md`](docs/console_frontend_mock.md).

## Structure

```
app/
  core/        # Settings, engine async, sécurité (JWT, clés API)
  models/      # SQLAlchemy 2.0 (users, domains, email_logs, suppression_list)
  schemas/     # Contrats Pydantic v2
  services/    # Client AWS SES v2 (boto3)
  api/v1/      # Routeurs FastAPI
alembic/       # Migrations
web/           # Vite + React console & marketing UI
docs/          # CDC, architecture, design system, notes frontend
```

## Notes de configuration

- `DATABASE_URL` pointe vers Supabase. Le service Postgres local de Compose n'est démarré qu'avec `docker compose --profile local up`.
- Les clés API seront préfixées par `envoy_live_` (`API_KEY_PREFIX`).
- Les credentials AWS vides s'appuient sur la chaîne IAM par défaut (profil local, rôle d'instance, etc.).
- `DNS_RECHECK_SECONDS` (défaut `30`) : en arrière-plan, l'API revérifie le DNS des domaines pas encore entièrement configurés et pousse les nouveaux statuts en direct à la console. `0` désactive ; ignoré sur Vercel (pas de processus permanent).
- Après une mise à jour du code, appliquer les migrations : `alembic upgrade head` (la `0024` ajoute la fin d'accès des membres).

## Fonctionnalités récentes

- **Fin d'accès d'un membre** : l'admin fixe une date (Edit access). Passé cette date, connexion, clés API et envois sont refusés ; le membre voit un compte à rebours dans l'en-tête et est déconnecté à zéro.
- **Invitations sans expiration** (option « Never ») : le lien reste valable jusqu'à usage ou révocation.
- **État des outils** (page Providers, admin) : badge « Working », ou « ? » expliquant ce qui bloque (clé absente, domaine non vérifié, sandbox SES, échecs des dernières 24 h).
- **Idée à venir** : configuration DNS sans quitter Envoy, voir [`docs/idee_configuration_dns_integree.md`](docs/idee_configuration_dns_integree.md).

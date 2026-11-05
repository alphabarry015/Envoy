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

Éditez `.env` : mot de passe PostgreSQL, `SECRET_KEY` (64+ caractères) et, si besoin, les identifiants AWS.

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

| Méthode | Chemin | Statut sprint 1 |
| --- | --- | --- |
| `GET` | `/health` | Opérationnel |
| `GET` | `/ready` | Opérationnel (ping PostgreSQL) |
| `POST` | `/api/v1/domains` | Stub (501) — déclaration domaine + records DNS |
| `GET` | `/api/v1/domains/{id}/verify` | Stub (501) — statut DKIM SES |
| `POST` | `/api/v1/send` | Stub (501) — envoi transactionnel |
| `POST` | `/api/v1/webhooks/ses` | Confirmation SNS opérationnelle ; bounces/complaints à brancher |

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

- `DATABASE_URL` utilise l'hôte `db` **à l'intérieur** de Compose. Hors conteneur, remplacer par `localhost`.
- Les clés API seront préfixées par `envoy_live_` (`API_KEY_PREFIX`).
- Les credentials AWS vides s'appuient sur la chaîne IAM par défaut (profil local, rôle d'instance, etc.).

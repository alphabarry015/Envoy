# Architecture Technique & Spécifications - Envoy

Plateforme transactionnelle auto-hébergée haute performance et gestion DNS/SES.

---

## 1. Vue d'ensemble du Système

**Envoy** est une alternative souveraine, conteneurisée et auto-hébergée aux services SaaS d'envoi d'e-mails transactionnels (tels que Resend ou SendGrid). Conçue pour offrir une autonomie opérationnelle totale, la plateforme couple la flexibilité d'une API moderne au moteur d'infrastructure d'Amazon Web Services (AWS SES v2).

* **Objectif principal** : Délivrer une performance d'envoi sub-seconde (< 80 ms pour la réponse API) tout en intégrant une couche native d'orchestration DNS/DKIM via Amazon SES v2.
* **Réduction structurelle des coûts** : Diminution de 80 % à 90 % des dépenses d'e-mailing par l'élimination des abonnements et surcoûts SaaS intermédiaires, en s'appuyant sur le tarif brut d'AWS SES (0,10 $ / 1 000 e-mails).
* **Isolation & Multi-tenancy** : Prise en charge native d'architectures multi-projets et multi-domaines sans restriction arbitraire de forfaits.

---

## 2. Stack Technique & Composants Core

L'architecture est optimisée pour une exécution asynchrone légère, minimisant l'empreinte mémoire et maximisant le débit I/O.

* **Backend API** : Python 3.11+ propulsé par FastAPI, Pydantic v2 (sérialisation et validation stricte) et le serveur ASGI Uvicorn.
* **Moteur d'envoi & Identités Cloud** : AWS SES v2 piloté via le SDK officiel `boto3`.
* **Orchestration DNS (Style Resend)** : Génération et récupération automatiques des enregistrements DNS d'authentification :
  * **DKIM (Easy DKIM)** : 3 enregistrements CNAME générés par AWS.
  * **SPF** : Enregistrement TXT (`v=spf1 include:amazonses.com ~all`).
  * **DMARC** : Enregistrement TXT (`v=DMARC1; p=none;` ou `p=quarantine;`).
  * *Aucun serveur DNS local à maintenir* : restitution claire des enregistrements pour copier-coller chez n'importe quel registrar (Cloudflare, OVH, Namecheap, etc.).
* **Persistance & Données** : PostgreSQL 15+ gérant les domaines, les clés d'API hashées (`envoy_live_...`), les logs d'envois, la table des révocations/désabonnements (`suppression_list`), les comptes utilisateurs et les quotas.
* **Infra & Déploiement** : Conteneurisation Docker, orchestration Docker Compose et déploiement simplifié sur VPS via Coolify.

---

## 3. Architecture des Modèles de Données & Data Flow

### Flux 1 : Onboarding & Vérification Domaine (Style Resend)
1. L'administrateur/utilisateur déclare un nouveau domaine via `POST /api/v1/domains`.
2. Envoy transmet l'ordre à AWS SES via `boto3` (`create_email_identity`).
3. SES provisionne les jetons DKIM. Envoy compile et retourne le jeu complet d'enregistrements DNS (CNAME, TXT SPF, TXT DMARC).
4. L'utilisateur configure les enregistrements chez son hébergeur DNS.
5. L'endpoint `GET /api/v1/domains/{id}/verify` consulte `get_email_identity` sur AWS SES. Dès confirmation du statut DKIM (`SUCCESS`), le domaine bascule à l'état actif.

### Flux 2 : Envoi d'E-mail Transactionnel (< 80 ms latency)
1. Réception de la charge utile sur `POST /api/v1/send` (sécurisé par clé Bearer `envoy_live_...`).
2. FastAPI inspecte la validité de la requête (champs `to`, `from`, `subject`, `html`/`text`, `attachments`), contrôle les quotas et consulte la table `suppression_list`.
3. Tout destinataire marqué comme en rebond permanent (*Hard Bounce*) ou ayant soumis une plainte (*Complaint*) est bloqué immédiatement au niveau API (préservation de la réputation IP/SES).
4. Un identifiant unique `messageId` est immédiatement retourné au client HTTP via `FastAPI BackgroundTasks`.
5. La tâche d'arrière-plan résout les pièces jointes (Base64 < 10 Mo) et délègue l'envoi à AWS SES.

### Flux 3 : Traitement des Bounces, Complaints & Webhooks (AWS SNS)
1. Les événements de délivrabilité (*Hard Bounces*, *Complaints*) sont capturés par AWS SNS (Simple Notification Service).
2. SNS transmet un webhook HTTP POST vers `/api/v1/webhooks/ses`.
3. Envoy valide la signature de la notification, traite automatiquement la confirmation d'abonnement (`SubscriptionConfirmation`) et parse les données de rebond/plainte.
4. L'adresse ciblée est instantanément enregistrée dans la table `suppression_list`.

---

## 4. Système de Gestion des Accès, RBAC & Quotas Dynamiques

* **Inscription Privée (Sur invitation)** : Absence de formulaire d'inscription public pour réduire la surface d'attaque. Seul un administrateur peut déclencher une invitation.
* **Tokens temporaires cryptographiques** : Génération de jetons d'invitation uniques (`invite_token`) expirables (24h/48h) envoyés par e-mail (`/auth/accept-invite?token=...`).
* **Quotas & Limites Dynamiques** : Définition par l'admin des plafonds de domaines autorisés et du volume d'envois (journalier/mensuel).
* **Révocation Instantanée** : Invalidation immédiate des clés API ou suspension de compte via middlewares FastAPI sans redémarrage du service.

---

## 5. Matrice des Endpoints API Core

| Méthode | Endpoint | Description | Sécurité |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/invite` | Envoi d'une invitation utilisateur avec quotas définis | Bearer Admin JWT |
| `POST` | `/api/v1/auth/accept-invite` | Activation de compte et création du mot de passe | Token public expirable |
| `POST` | `/api/v1/domains` | Déclaration d'un domaine & génération des clés DNS | Bearer API Key / JWT |
| `GET` | `/api/v1/domains/{id}/verify` | Interrogation AWS SES pour validation DKIM/SPF | Bearer API Key / JWT |
| `POST` | `/api/v1/send` | Envoi d'e-mail transactionnel (HTML, texte, PJ max 10 Mo) | Bearer API Key |
| `POST` | `/api/v1/webhooks/ses` | Traitement des événements AWS SNS (Bounces/Complaints) | Signature AWS SNS |

---

## 6. Feuille de Route Fonctionnelle

### Version 1 (Socle & Améliorations Immédiates)
* **Templates Engine** : Moteur de modèles HTML dynamiques (Jinja2) avec variables personnalisables (`{{nom_client}}`).
* **Mode Sandbox** : Clés API de test pour simuler les envois sans impacter la réputation AWS SES.
* **Tracking d'Engagement** : Pixel invisible pour l'ouverture et réécriture des liens pour le suivi des clics.
* **Rate Limiting** : Algorithme *Token Bucket* par clé API pour prévenir les surcharges.
* **Audit Logs** : Traçabilité et filtrage avancé des logs d'envoi.

### Version 2 (Haute Performance & Protection Avancée)
* **Failover Multi-SMTP** : Basculement automatique vers un relais de secours (Mailgun, SendGrid) en cas d'échec SES.
* **Rotation d'IP & Domaines** : Répartition de la charge d'envoi pour lisser la réputation.
* **Protection Anti-Spam-Traps** : Validation syntaxique et détection prédictive des adresses à risque.
* **Désabonnement RFC (One-Click Unsubscribe)** : Gestion des en-têtes RFC 8058 / 2369 et désabonnement automatique.
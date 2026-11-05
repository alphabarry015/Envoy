# CAHIER DES CHARGES - ENVOY
**Plateforme d'envoi et de gestion d'e-mails transactionnels & DNS**

---

## 1. PRÉSENTATION DU PROJET

* **Nom de la solution** : Envoy
* **Objectif** : Fournir une alternative auto-hébergée, souveraine et performante aux services tiers d'envoi d'e-mails (comme Resend ou SendGrid).
* **Périmètre** : Déclaration de domaines d'envoi, génération d'enregistrements DNS (DKIM, SPF, DMARC) à configurer chez l'hébergeur de domaine du client, envoi d'e-mails transactionnels via API REST, gestion des événements (webhooks) et suivi des métriques.

### 1.1 Avantages Économiques et Stratégiques vs Resend

* **Économie Financière Radicale** : Réduction des coûts d'envoi jusqu'à 80-90% grâce à la tarification directe d'Amazon SES (0,10 \$ / 1 000 e-mails) sans abonnement mensuel fixe ni surcoût à l'échelle.
* **Zéro Surcoût par Domaine / Multi-projets** : Nombre illimité de domaines gérés sans restriction de forfait ni facturation supplémentaire.
* **Liberté Architecturale** :
  * Contrôle total sur la stack technique (Python / FastAPI / PostgreSQL / Docker).
  * Possibilité d'adapter, personnaliser ou étendre la logique métier et les API selon les besoins spécifiques des applications clientes (OpenRich, flowen agency, etc.).
  * Indépendance vis-à-vis des limitations de fonctionnalités ou des politiques tarifaires des SaaS propriétaires.

| Attribut | Description fonctionnelle |
| :--- | :--- |
| **Cible d'usage** | Développeurs, infrastructures multi-projets, PME et structures soucieuses de la souveraineté de leurs données d'envoi. |
| **Philosophie d'ingénierie** | Architecture légère, asynchrone, modulaire et orientée conteneurs. |
| **Modèle économique** | Open-source, sans coûts logiciels récurrents, facturation strictly alignée sur l'usage AWS SES. |

---

## 2. ARCHITECTURE TECHNIQUE & STACK

* **Backend API** : Python 3.11+ avec FastAPI et Uvicorn.
* **Moteur d'envoi & Identités Cloud** : Amazon SES v2 via le SDK officiel `boto3`.
* **Gestion DNS (Style Resend)** : Génération automatique des enregistrements DNS (TXT/CNAME) par l'API `boto3` d'AWS SES, affichés dans l'interface/API Envoy pour copier-coller chez n'importe quel registrar/hébergeur externe (Cloudflare, OVH, Namecheap, GoDaddy, Porkbun, etc.). Aucun serveur DNS local à maintenir.
* **Base de données** : PostgreSQL (Stockage des domaines, clés API, logs d'envois, modèles et contacts).
* **Déploiement & Infrastructure** : Docker, Docker Compose, hébergé sur VPS géré via Coolify.

---

## 3. SPÉCIFICATIONS FONCTIONNELLES

### 3.1 Gestion des Domaines & Configuration DNS (Flux à la Resend)

* **Ajout de Domaine** : Endpoint API / Interface permettant de déclarer un nouveau domaine d'envoi.
* **Génération des Enregistrements DNS** :
  * Création automatique de l'identité du domaine sur AWS SES via `boto3`.
  * Récupération automatique des 3 enregistrements CNAME (Easy DKIM).
  * Génération de l'enregistrement SPF (`TXT: v=spf1 include:amazonses.com ~all`).
  * Génération de l'enregistrement DMARC (`TXT: v=DMARC1; p=none;` ou `p=quarantine;`).
* **Affichage des Enregistrements (DNS Records Payload)** : Restitution claire de la liste des enregistrements (Type, Name, Value, TTL, Status) à copier-coller chez l'hébergeur DNS du client.
* **Vérification du Domaine (Verify Endpoint)** :
  * Interrogation de l'API AWS SES (`get_email_identity`) à la demande ou via tâche de fond.
  * Validation du statut DKIM (`SUCCESS`) et activation du domaine pour l'envoi dès propagation effectuée.

### 3.2 Service d'Envoi d'E-mails (API & Core)

* **Endpoint `/api/v1/send`** : Réception des requêtes HTTP POST sécurisées par clé API Bearer.
* **Payload supporté** :
  * **Destinataire(s)** : simple, tableau (`to`), copies conformes (`cc`, `bcc`).
  * **Expéditeur (`from`)** : validation du domaine d'envoi vis-à-vis des identités validées.
  * **Sujet** : encodage UTF-8 natif.
  * **Contenu** : HTML formaté, version alternative texte brut (`text/plain`).
  * **Pièces jointes** : encodage Base64 avec détection du type MIME et validation de taille maximale (10 Mo).
* **Traitement Asynchrone (Non-bloquant)** : Utilisation de `FastAPI BackgroundTasks` pour transmettre immédiatement le `messageId` à l'appelant pendant que l'e-mail est expédié en arrière-plan via Amazon SES.
* **Temps de réponse de l'endpoint** maintenu sous les 80 millisecondes.

| Champ de payload | Type | Obligatoire | Description |
| :--- | :--- | :--- | :--- |
| `to` | Array / String | Oui | Liste des adresses cibles valides |
| `from` | String | Oui | Adresse d'expédition alignée avec un domaine vérifié |
| `subject` | String | Oui | Ligne d'objet de l'e-mail |
| `html` | String | Conditionnel | Corps de l'e-mail au format HTML (requis si `text` omis) |
| `text` | String | Conditionnel | Corps alternatif textuel pour clients légers |
| `attachments` | Array[Object] | Non | Fichiers attachés (nom, encodage Base64, MIME type) |

### 3.3 Traitement des Réseaux & Webhooks (Bounces & Complaints)

* **Capture des événements** : Intégration d'AWS SNS (Simple Notification Service) connecté aux alertes de rebonds (Bounces), livraisons et plaintes (Spam).
* **Endpoint Webhook (`/api/v1/webhooks/ses`)** : Traitement automatique des notifications AWS SNS pour marquer les adresses invalides et éviter les réexpéditions.
* Gestion du protocole de confirmation de souscription SNS (`SubscriptionConfirmation`).
* Inscription des rebonds durs (Hard Bounces) et des plaintes dans une liste de suppression globale (`Suppression List`).
* Blocage proactif au niveau de l'API de tout envoi ultérieur vers une adresse présente dans la liste de suppression afin de préserver la réputation d'expéditeur.

### 3.4 Gestion de la Liste de Suppression Anti-Spam (Suppression List)

* **Ingestion Automatique** : Interception des notifications AWS SNS (`boto3`) lors d'un Hard Bounce ou d'une plainte pour spam (Complaint), avec enregistrement automatique de l'adresse dans la table `suppression_list`.
* **Filtrage Proactif à l'Envoi** : Vérification systématique par FastAPI avant d'appeler l'API Amazon SES. Si le destinataire figure dans la liste de suppression, l'envoi est bloqué immédiatement afin de protéger la réputation du domaine d'expédition.

### 3.5 Système d'Onboarding, Invitations Admin & Contrôle d'Accès Dynamique (RBAC & Quotas)

* **Création par l'Administrateur** : Aucune inscription publique libre (absence de formulaire d'inscription direct). L'administrateur saisit l'adresse e-mail du futur utilisateur depuis son panel privé d'administration.
* **Définition des Quotas & Limites Initiales** : Lors de l'envoi de l'invitation, l'administrateur définit explicitement le nombre maximal de domaines que l'utilisateur a le droit de connecter (ex: 1, 5, illimité), ainsi que son quota d'envois mensuels ou journaliers.
* **Tokens d'Invitation Expirables** : Génération d'un token cryptographique unique jetable (`invite_token`) associé à une date d'expiration (ex: 24h ou 48h) et création du compte au statut `pending`.
* **Lien d'Activation Temporaire** : Expédition automatique d'un e-mail d'invitation contenant un lien unique (`/auth/accept-invite?token=...`).
* **Activation et Définition du Mot de Passe** : Validation du token à l'accès au lien, définition et confirmation du mot de passe par l'invité, passage au statut `active` et invalidation du token.
* **Gestion Dynamique des Permissions en Temps Réel (Admin Override & RBAC)** :
  * L'administrateur conserve un contrôle absolu sur chaque compte utilisateur depuis le panel Admin global.
  * *Modifications à chaud* : Possibilité de modifier en temps réel les quotas de domaines (ex: passer de 2 à 5 domaines autorisés), d'activer/désactiver la création de clés API, ou de suspendre temporairement un compte.
  * *Révocation instantanée* : Révocation immédiate des droits ou blocage des clés API associées à un utilisateur si nécessaire (application immédiate au niveau des middlewares FastAPI).

---

## 4. SÉCURITÉ & PERFORMANCES

* **Authentification API** : Clés API chiffrées avec gestion des autorisations et préfixes sécurisés (`envoy_live_...`).
* **Délivrabilité** : Signature DKIM systématique via SES, alignement SPF et DMARC stricts.
* **Simplicité & Isolation** : Zéro serveur DNS intermédiaire à gérer ou sécuriser ; dépendance minimale et compatibilité 100% universelle avec tous les registrars.

---

## 5. FEUILLE DE ROUTE & DÉPLOIEMENT

* **Phase 1** : Création des endpoints de déclaration de domaine et d'extraction des enregistrements DKIM/SPF via `boto3`.
* **Phase 2** : Implémentation de la vérification de statut DNS (`get_email_identity`) et sécurisation des routes.
* **Phase 3** : Développement du moteur d'envoi `/api/v1/send` avec `FastAPI BackgroundTasks` et Amazon SES.
* **Phase 4** : Intégration du Webhook AWS SNS pour la gestion automatique des Bounces et Complaints.
* **Phase 5** : Packaging Docker Compose et déploiement sur VPS via Coolify.

---

## 6. FEUILLE DE ROUTE DE FONCTIONNALITÉS FUTURES & ÉVOLUTIONS AVANCÉES

### 6.1 Fonctionnalités V1 (Socle de Base et Améliorations Immédiates)

* **Moteur et Gestionnaire de Modèles d'E-mails (Templates Engine)** : Modèles HTML dynamiques enregistrés en base de données avec variables personnalisables (ex: `{{nom_client}}`), évitant d'envoyer le code HTML à chaque appel API.
* **Mode "Sandbox" (Environnement de Test)** : Permet de générer des clés API de test pour simuler les envois d'e-mails sans appeler Amazon SES ni impacter la délivrabilité.
* **Suivi des Ouvertures et des Clics (Engagement Analytics)** : Tracking automatique via un pixel invisible et réécriture des liens pour mesurer l'interaction des destinataires en temps réel.
* **Recherche et Filtrage Avancé des Logs (Audit Trail)** : Interface et endpoints pour filtrer les logs d'envoi par statut, date, clé API émettrice et destinataire.
* **Contrôle du Débit par Clé API (Rate Limiting)** : Seuil configurable de requêtes par seconde/minute pour éviter la saturation d'AWS SES ou la surcharge serveur en cas de bug applicatif.

### 6.2 Fonctionnalités V2 (Haute Performance & Protection Avancée)

* **Routage Multi-Fournisseurs avec Basculement Automatique (Failover / Multi-SMTP)** : Détection d'échec en temps réel sur Amazon SES et basculement instantané vers un relais de secours (Mailgun, SendGrid, etc.).
* **Rotation Intelligente des Domaines d'Expédition (IP / Domain Rotation)** : Répartition de la charge d'envoi sur plusieurs domaines et sous-domaines pour lisser la réputation.
* **Détection Prédictive des Spam-Traps & Adresses Toxiques** : Nettoyage et validation syntaxique/comportementale à l'entrée avant toute tentative d'envoi.
* **Centre de Préférences et Désabonnement Global (One-Click Unsubscribe)** : Ingestion des en-têtes et liens de désabonnement conformes aux RFC et blocage automatique des réexpéditions.
* **Détection d'Anomalies et Audit Trail par Règles Heuristiques** : Analyse comportementale des requêtes API pour suspendre automatiquement les clés compromises en cas de pic d'envoi anormal.
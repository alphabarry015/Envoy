# Idée : configuration DNS intégrée (sans quitter Envoy)

> Statut : **idée documentée, non implémentée**.

## Problème

Aujourd'hui, pour connecter un domaine, l'utilisateur doit copier chaque record
(DKIM, SPF, DMARC, MX, records propres à Brevo / Mailtrap…) dans le panneau de son
hébergeur DNS (Vercel, Cloudflare, OVH, GoDaddy…), puis revenir dans Envoy pour
lancer la vérification. C'est lent, source d'erreurs (deux SPF, deux `_dmarc`, MX
prioritaire mal placé) et c'est l'étape où les nouveaux membres décrochent.

Objectif : un bouton **« Configurer automatiquement »** qui publie les records chez
l'hébergeur DNS, de façon sécurisée, sans que l'utilisateur quitte le site.

## Options

### 1. Domain Connect (standard ouvert, option privilégiée)

- Protocole ouvert (GoDaddy, IONOS, Cloudflare…) : on publie un **template** de
  records, chaque hébergeur doit l'approuver.
- L'utilisateur est redirigé vers son hébergeur, se connecte chez lui et accepte
  l'application du template : Envoy ne voit **jamais** ses identifiants.
- Gratuit et sans dépendance à un service tiers.
- Contraintes : approbation à obtenir hébergeur par hébergeur, records variables
  (DKIM par domaine, `include:` SPF par outil) à prévoir dans le template,
  support **Vercel non confirmé**.

Intégration prévue côté Envoy :

1. Rédiger et soumettre le template Envoy (dépôt public `Domain-Connect/Templates`).
2. `GET /api/v1/domains/{id}/dns-connect` → découvre l'hébergeur du domaine
   (record TXT `_domainconnect`) et renvoie l'URL de configuration signée.
3. Front : bouton à côté de « Re-check DNS » qui ouvre cette URL ; au retour,
   la revérification automatique met les statuts à jour.

### 2. API directes des hébergeurs (Vercel, Cloudflare, Route 53)

- L'utilisateur colle un **token à portée DNS uniquement**, utilisé une seule fois
  pour créer les records, **jamais stocké** (ni en base, ni dans les logs).
- Vercel : `POST /v4/domains/{domain}/records` ; Cloudflare : `POST /zones/{id}/dns_records` ;
  Route 53 : `ChangeResourceRecordSets`.
- Gratuit, mais à maintenir hébergeur par hébergeur, et l'utilisateur doit savoir
  créer un token.
- Nos deux domaines actuels (flowenagency.com, futaislamiccenter.com) sont sur
  **Vercel DNS** : c'est la première cible logique, en complément de Domain Connect
  tant que Vercel ne le supporte pas.

## Règles à respecter quelle que soit l'option

- Un seul record SPF par nom : fusionner les mécanismes (`include:`) dans l'existant.
- Un seul `_dmarc` : ne pas écraser une politique DMARC existante.
- MX : ne jamais remplacer les MX de réception (Google…) sans accord explicite
  (cas Mailtrap, qui exige son MX en priorité).
- Après publication : la vérification reste celle d'Envoy (`dns_check.py`), et la
  revérification automatique en arrière-plan (toutes les 30 s, voir
  `app/services/dns_watcher.py`) met les statuts à jour en direct.

## Recommandation

1. **Domain Connect** en premier : standard ouvert, gratuit, aucune donnée sensible
   chez nous.
2. **API directes Vercel puis Cloudflare** (token à usage unique non stocké) pour
   les hébergeurs qui ne supportent pas encore Domain Connect.
3. Guide manuel pas à pas pour tous les autres hébergeurs.

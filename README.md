# weeko-api

API NestJS + Prisma 7 + PostgreSQL de l'app mobile Weeko (planning d'un répétiteur :
élèves à domicile, sites Succès Group et leurs classes, séances, pointage, rattrapages).

Projet séparé de l'app Flutter, qui vit dans `../weeko`.

La logique métier (solveur de créneaux, génération de semaine, pointage, rattrapages)
est un port fidèle de `../weeko/lib/logic/app_state.dart` : [src/planning/planner.ts](src/planning/planner.ts).

## Démarrer

```bash
cp .env.example .env
npm install              # lance aussi `prisma generate`
npm run db:up            # conteneur Postgres « weeko-db » (docker compose)
npm run prisma:migrate   # applique les migrations
npm run db:seed          # données de démo de l'app (ids identiques : ange, adje, sondo, ma, ng, c1…c4)
npm run start:dev        # http://localhost:3000/api
```

Seed : [src/prisma/seed.ts](src/prisma/seed.ts) (vide puis recrée toutes les tables). Compilé avec l'API :
en prod, `node dist/prisma/seed.js`.

Tests : `npm test` (solveur, sans base) · `npm run test:e2e` (base requise).

## Clé API

Toutes les routes exigent l'en-tête `x-api-key` égal à `API_KEY` (fichier `.env`), sauf `GET /health`.
Sans clé ou avec une mauvaise clé : `401`. L'API refuse de démarrer si `API_KEY` est absent.

```bash
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/state
```

Générer une clé : `openssl rand -hex 32`. L'app mobile doit avoir la même valeur dans `../weeko/.env.json`.

## Conventions

- Heures en minutes depuis minuit (`930` = 15h30), jours `0` = lundi … `6` = dimanche.
- `week` = décalage par rapport à la semaine 0 (lundi 5 octobre 2026), comme dans l'app.
- Champs `svc` / `cls` identiques aux modèles Dart ; les réponses de mutation portent
  un `message` (texte du toast de l'app).

## Endpoints (préfixe `/api`)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | Santé |
| GET | `/state` | Tout l'état (premier chargement de l'app) |
| GET/PATCH | `/settings` | Réglages : `{ travel }` (compter les trajets, désactivé par défaut) |
| GET | `/weeks/:week` | Semaine : préparation, séances, séances Succès Group non placées |
| PATCH | `/weeks/:week/prep` | `{ off?, counts?, changes?, include? }` |
| POST | `/weeks/:week/preview` | Aperçu de la génération (rien n'est enregistré) |
| POST | `/weeks/:week/generate` | Génère et enregistre le planning de la semaine |
| GET | `/sessions?week=` | Séances |
| GET | `/sessions/:id` | Une séance |
| POST | `/sessions/:id/pointer` | `{ missed, who?, motif?, redo? }` |
| GET | `/sessions/:id/ics` | Export agenda `.ics` |
| GET | `/rattrapages` | Séances dues + séances Succès Group non placées |
| GET | `/rattrapages/:key/proposals` | 3 créneaux proposés |
| GET | `/rattrapages/:key/days/:day` | Créneau possible ce jour, sinon raison |
| POST | `/rattrapages/:key/place` | `{ proposal }` ou `{ day }` |
| GET/POST | `/students` | Élèves (règle incluse) / nouvel élève (formulaire de l'app) |
| GET/PATCH/DELETE | `/students/:id` | Fiche élève + historique |
| GET/POST | `/sites`, PATCH/DELETE `/sites/:id` | Sites Succès Group (+ classes) |
| GET/POST | `/classes`, PATCH/DELETE `/classes/:id` | Classes (`defaultCount` = séances par défaut) |
| GET/POST | `/base-slots`, DELETE `/base-slots/:id` | Planning de base recopié à chaque génération |

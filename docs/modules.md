## Modules de jeu

Stockage : MongoDB via Mongoose, collection `ModuleEntity`.

### Schéma
- `name` (string, unique, requis)
- `description` (string, requis)
- `rules` (string, requis)
- `imgUrl?` (string)
- `solutions` (string[], requis) — étapes/solutions détaillées pour résoudre le module (utilisées pour la répartition aux analystes)

### Endpoints REST
- `POST /module`  
  payload : `{ name, description, rules: string, solutions: string[], imgUrl?: string }`
- `GET /module`  
  liste tous les modules.
- `GET /module/:id`  
  récupère un module.
- `PUT /module/:id`  
  met à jour un module (payload identique au modèle).
- `DELETE /module/:id/delete`  
  supprime un module.

### Tirage aléatoire
- `moduleService.findSome(quantity)` utilise un `aggregate().sample(quantity)` MongoDB pour renvoyer un échantillon aléatoire (5 modules pour `startGame`).

### Seed de modules fictifs
- Script : `npm run seed:modules` (nécessite `DATABASE_URL` dans l’environnement).
- Source : `scripts/seed-modules.ts` (upsert par `name`, sans doublons).

### Répartition des infos (solutions)
- Au `startGame`, les 5 modules tirés sont diffusés avec leurs `rules` (communes) pour tous, sans les `solutions`.
- Les `solutions` sont réparties en round-robin uniquement entre les analystes (une partie exige au moins un analyste).
- Si un module n’a pas de `solutions`, aucune allocation n’est faite (les `rules` restent visibles pour tous).
- L’événement `gameStarted` inclut :
  - `solutionsDistribution` : `{ moduleId, allocations { analysteSocketId: { index, text }[] } }`
  - `solutionsByAnalyste` : `{ analysteSocketId: [{ moduleId, solutions: { index, text }[] }] }`
  - Chaque solution a `index` (1-based, ex. 3 pour "Solution 3") et `text` (contenu)

## Modules de jeu

Stockage : MongoDB via Mongoose, collection `ModuleEntity`.

### Schéma
- `name` (string, unique, requis)
- `description` (string, requis)
- `rules?` (string[])
- `imgUrl?` (string)

### Endpoints REST
- `POST /module`  
  payload : `{ name, description, rules?: string[], imgUrl?: string }`
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

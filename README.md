## Leaving Box API

API NestJS pour piloter des parties "Leaving Box" : gestion des sessions de jeu en temps réel via WebSockets (Socket.IO), sélection aléatoire de modules, timer partagé et exposition d’un manuel PDF.

### Pile technique
- NestJS + TypeScript
- Socket.IO Gateway pour le temps réel
- Redis pour stocker l’état des sessions (timers, joueurs, état)
- MongoDB (Mongoose) pour les fiches modules
- Swagger disponible sur `/api`
- Fichiers statiques (PDF) servis sur `/manuals`

---

## Démarrage rapide
```bash
npm install

# dev
npm run start:dev

# prod (NODE_ENV=production)
npm run start:prod
```
Swagger est accessible sur `http://localhost:3000/api`.

### Variables d’environnement
- `PORT` (optionnel, défaut 3000)
- `DATABASE_URL` : URI MongoDB (obligatoire)
- `REDIS_HOST` / `REDIS_PORT` : accès Redis (défaut localhost:6379)
- `NODE_ENV` : `development` ou `production`  
Le module Config lit `./environment/.env.dev` en dev et `./environment/.env.prod` en prod.

### Données persistées
- **Sessions** : stockées dans Redis sous `session:{code}`  
  `{ id, code, maxTime, remainingTime, timerStarted, createdAt, players[], started }`
- **Modules** : collection MongoDB avec `{ name, description, rules?, imgUrl? }`

### Ressources statiques
`/manuals/module-simon.pdf` (et autres PDF placés dans `public/manuals`).

---

## API REST

### Sessions
- `GET /sessions` : liste les clés Redis des sessions actives.
- `GET /sessions/:sessionCode` : retourne `{ success, session }` ou message d’erreur.

### Modules
- `POST /module` : créer un module  
  payload : `{ name, description, rules?: string[], imgUrl?: string }`
- `GET /module` : lister tous les modules.
- `GET /module/:id` : récupérer un module.
- `PUT /module/:id` : mettre à jour un module.
- `DELETE /module/:id/delete` : supprimer un module.

---

## WebSockets (Socket.IO)
Gateway : `SessionsGateway` (CORS `origin: *`). Les clients rejoignent une room par code de session.

### Événements client -> serveur
- `createSession` `{ difficulty: 'Easy' | 'Medium' | 'Hard' }`  
  Crée une session, associe l’agent (socket.id) et rejoint la room. Durées : Easy 900s, Medium 600s, Hard 60s.
- `getSession` `{ sessionCode }`  
  Si le client est déjà dans la room, renvoie l’état courant et la liste des sockets connectés.
- `joinSession` `{ sessionCode, player }`  
  Ajoute le joueur (`socket.id-player`) dans Redis et rejoint la room.
- `leaveSession` `{ sessionCode, player }`  
  Retire le joueur et quitte la room.
- `startGame` `{ sessionCode }`  
  Marque la session comme démarrée et pousse 5 modules aléatoires via `moduleService.findSome(5)`.
- `clearSession` `{ sessionCode }`  
  Supprime la session Redis, stoppe le timer et éjecte les sockets de la room.
- `startTimer` `{ sessionCode }`  
  Démarre le timer partagé (à partir de `maxTime`) si non déjà lancé.
- `stopTimer` `{ sessionCode }`  
  Stoppe le timer et remet `remainingTime` à 0.

### Événements serveur -> client
- `sessionCreated` `{ session }`
- `currentSession` `{ sessionCode, sessionData, connectedClients }`
- `playerJoined` `{ player, session }`
- `playerLeft` `{ player, session }`
- `gameStarted` `{ session, moduleManuals }`
- `sessionCleared` `{ sessionCode }`
- `timerUpdate` `{ remaining }` (toutes les secondes)
- `timerStopped` `{ sessionCode }`
- `gameOver` `{ message }` (quand le timer atteint 0)
- `error` `{ message }`

### Comportement du timer
- Un intervalle par session (`sessionTimers`) décrémente `remaining` chaque seconde.
- À 0 : arrêt de l’intervalle, `remainingTime` mis à 0 dans Redis, émission `gameOver`.
- `stopTimer` ou `clearSession` nettoient l’intervalle et mettent fin au timer.

---

## Scripts utiles
- `npm run start` : lancement simple.
- `npm run start:dev` : mode watch.
- `npm run start:prod` : prod.
- `npm run test` / `npm run test:e2e` / `npm run test:cov` : tests par défaut Nest (non spécialisés projet).

---

## Points d’extension
- Restreindre qui peut déclencher `startGame` / `startTimer` (actuellement tout client).
- Ajouter une TTL Redis pour nettoyer les sessions inactives.
- Sécuriser l’origine Socket.IO et documenter les payloads avec Swagger WebSocket (ou schéma partagé).

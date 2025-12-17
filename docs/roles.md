## Rôles (Agent / Operator)

Il n’y a pas d’authentification globale, mais certaines actions sont désormais contrôlées côté gateway selon le rôle.

### Rôles attendus (convention produit)
- **Agent** : créateur de la session (`createSession`), identifié par `socket.id`, stocké comme premier élément de `session.players`. C’est l’opérateur principal (démarre/arrête, nettoie).
- **Operator** : participants qui rejoignent une session via `joinSession` avec un pseudo. Stockés sous forme de chaînes `socket.id-pseudo` dans Redis.

### Droits (appliqués)
- Agent uniquement : `createSession`, `startGame`, `startTimer`, `stopTimer`, `clearSession` (contrôle via `session.agentId === socket.id`).
- Operators : `joinSession`, `leaveSession`, recevoir les mises à jour.
- Endpoints REST : toujours sans auth ni rôle (CRUD modules, lecture sessions).

### Données côté serveur
- Session Redis : `{ id, code, agentId, maxTime, remainingTime, timerStarted, createdAt, players[], started }`.
  - `agentId` = socket du créateur (référence pour les contrôles).
  - `players[0]` reste l’agent initial.
  - Pas de champ explicite `role` par joueur, identité = `socket.id` + pseudo pour les operators.

### Limitations actuelles
- Pas d’authentification (REST ou WebSocket).
- Pas de TTL sur les sessions (risque d’entrées persistantes).

### Pistes d’évolution
- Ajouter un champ `role` par joueur (agent/operator) et vérifier côté gateway avant `startGame`/`startTimer`/`clearSession`.
- Authentifier le handshake Socket.IO (JWT court ou signature du code de session) et restreindre CORS.
- Ajouter une TTL ou un job de purge des sessions expirées.

## Rôles (Agent / Operator)

Il n’y a pas d’authentification globale, mais certaines actions sont désormais contrôlées côté gateway selon le rôle.

### Structure des joueurs
- Chaque joueur est un objet `{ id, role, label }`.
- Agent : `id = socket.id`, `role = agent`, `label = agent`.
- Operators : `id = socket.id`, `role = operator`, `label = operator N` (numérotation automatique selon l’ordre d’arrivée).

### Logs (debug)
- `sessionCreated` : affiche le code de session et la liste complète `players`.
- `playerJoined` : affiche le code de session et la liste `players` après ajout.
- `gameStarted` : affiche le code de session, les `players` et les `operators` (destinataires des solutions).

### Rôles attendus (convention produit)
- **Agent** : créateur de la session (`createSession`), identifié par `socket.id`, stocké comme premier élément de `session.players`. C’est l’opérateur principal (démarre/arrête, nettoie).
- **Operator** : participants qui rejoignent une session via `joinSession`; stockés comme objets avec `id` (socket.id), `role`, `label`.

### Droits (appliqués)
- Agent uniquement : `createSession`, `startGame`, `startTimer`, `stopTimer`, `clearSession` (contrôle via `session.agentId === socket.id`).
- Operators : `joinSession`, `leaveSession`, recevoir les mises à jour.
- Conditions de lancement : `startGame` et `startTimer` exigent au moins un operator présent (players hors agent).
- Endpoints REST : toujours sans auth ni rôle (CRUD modules, lecture sessions).

### Données côté serveur
- Session Redis : `{ id, code, agentId, maxTime, remainingTime, timerStarted, createdAt, players[], started }`.
  - `agentId` = socket du créateur (référence pour les contrôles).
  - `players` est un tableau d’objets `{ id, role, label }`.

### Limitations actuelles
- Pas d’authentification (REST ou WebSocket).
- Pas de TTL sur les sessions (risque d’entrées persistantes).

### Pistes d’évolution
- Ajouter un champ `role` par joueur (agent/operator) et vérifier côté gateway avant `startGame`/`startTimer`/`clearSession`.
- Authentifier le handshake Socket.IO (JWT court ou signature du code de session) et restreindre CORS.
- Ajouter une TTL ou un job de purge des sessions expirées.

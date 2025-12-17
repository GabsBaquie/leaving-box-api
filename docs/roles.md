## Rôles (Agent / Operator)

Il n’y a pas d’authentification ni de contrôle de rôle côté API : les rôles sont implicites et laissés au client.

### Rôles attendus (convention produit)
- **Agent** : créateur de la session (`createSession`), identifié par `socket.id`, stocké comme premier élément de `session.players`. C’est l’opérateur principal (démarre/arrête, nettoie).
- **Operator** : participants qui rejoignent une session via `joinSession` avec un pseudo. Stockés sous forme de chaînes `socket.id-pseudo` dans Redis.

### Droits attendus (cible souhaitée)
- Agent : devrait être le seul à pouvoir `startGame`, `startTimer`, `stopTimer`, `clearSession`.
- Operators : rejoindre/quitter (`joinSession` / `leaveSession`), recevoir les mises à jour, jouer/interagir.

### Droits effectivement appliqués dans le code actuel
- **Aucune restriction** : tout client peut appeler `createSession`, `startGame`, `startTimer`, `stopTimer`, `clearSession`.
- Join/Leave ouverts à tous avec le code de session.
- Endpoints REST (CRUD modules, lecture sessions) sans auth ni rôle.

### Données côté serveur
- Session Redis : `{ id, code, maxTime, remainingTime, timerStarted, createdAt, players[], started }`.
  - `players[0]` = agent créateur (convention uniquement).
  - Pas de champ explicite `role`; aucune persistance d’identité autre que `socket.id` + pseudo.

### Limitations actuelles
- Pas de vérification de rôle pour les actions sensibles.
- Pas d’authentification (REST ou WebSocket).
- Pas de TTL sur les sessions (risque d’entrées persistantes).

### Pistes d’évolution
- Ajouter un champ `role` par joueur (agent/operator) et vérifier côté gateway avant `startGame`/`startTimer`/`clearSession`.
- Authentifier le handshake Socket.IO (JWT court ou signature du code de session) et restreindre CORS.
- Ajouter une TTL ou un job de purge des sessions expirées.

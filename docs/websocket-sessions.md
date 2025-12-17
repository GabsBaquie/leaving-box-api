## WebSockets : gestion de session

Gateway : `SessionsGateway` (Socket.IO) avec CORS ouvert. Les sockets rejoignent la room du code de session.

### Événements client → serveur
- `createSession` `{ difficulty: 'Easy' | 'Medium' | 'Hard', role?: 'agent' }` **(agent uniquement)**  
  Refus si `role` est présent et différent de `agent`. Crée une session, associe l’agent (`socket.id`), rejoint la room. Durées : Easy 900s, Medium 600s, Hard 60s.  
  Réponse : `sessionCreated`.
- `getSession` `{ sessionCode }`  
  Si le client est déjà dans la room, envoie `currentSession` (état + sockets connectées).  
  Réponse directe `{ success }` ou message d’erreur.
- `joinSession` `{ sessionCode, player }`  
  Force le socket à quitter ses autres rooms (hors ID propre), rejoint `sessionCode`. Ajoute le joueur dans Redis sous `socket.id-player`.  
  Diffusion : `playerJoined`.
- `leaveSession` `{ sessionCode, player }`  
  Retire le joueur de Redis, quitte la room, diffuse `playerLeft`.
- `startGame` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `session.agentId === socket.id`, marque la session `started: true`, récupère 5 modules aléatoires (`moduleService.findSome(5)`), diffuse `gameStarted`.
- `clearSession` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId`, supprime la session Redis, stoppe le timer, éjecte les sockets de la room, diffuse `sessionCleared`.
- `startTimer` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId`, démarre le timer partagé (si non déjà lancé). Diffusion régulière `timerUpdate`.
- `stopTimer` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId`, arrête le timer, `remainingTime` remis à 0, diffuse `timerStopped`.

### Événements serveur → client
- `sessionCreated` `{ session }`
- `currentSession` `{ sessionCode, sessionData, connectedClients }`
- `playerJoined` `{ player, session }`
- `playerLeft` `{ player, session }`
- `gameStarted` `{ session, moduleManuals }`
- `sessionCleared` `{ sessionCode }`
- `timerUpdate` `{ remaining }` (toutes les secondes)
- `timerStopped` `{ sessionCode }`
- `gameOver` `{ message }` (fin du temps)
- `error` `{ message }`

### Règles côté serveur
- Un seul intervalle de timer par session (`sessionTimers`).
- Les sockets quittent leurs rooms précédentes (hors ID) avant de rejoindre une session.
- Les données de session vivent dans Redis : clé `session:{code}`.
- Contrôle d’autorisation sur `startGame`, `startTimer`, `stopTimer`, `clearSession` via `session.agentId === socket.id`.

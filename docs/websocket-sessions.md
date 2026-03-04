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
  Force le socket à quitter ses autres rooms (hors ID propre), rejoint `sessionCode`. Ajoute un analyste `{ id: socket.id, role: analyste, label: analyste N }`.  
  Diffusion : `playerJoined` (avec `playerId`, `playerLabel`, `playerRole` obligatoire). Log console de la liste `players`.
- `leaveSession` `{ sessionCode, player }`  
  Retire le joueur de Redis, quitte la room, diffuse `playerLeft`.
- `startGame` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `session.agentId === socket.id` et la présence d’au moins un analyste. Marque `started: true`, récupère 5 modules aléatoires (`moduleService.findSome(5)`), diffuse `gameStarted` avec `moduleManuals` (sans solutions), `solutionsDistribution` et `solutionsByAnalyste` (solutions réparties entre analystes). Log console : code session, `players`, analystes destinataires.
- `clearSession` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId`, supprime la session Redis, stoppe le timer, éjecte les sockets de la room, diffuse `sessionCleared`.
- `startTimer` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId` et la présence d’au moins un analyste. Démarre le timer partagé (si non déjà lancé). Diffusion régulière `timerUpdate`.
- `stopTimer` `{ sessionCode }` **(agent uniquement)**  
  Vérifie `agentId`, arrête le timer, `remainingTime` remis à 0, diffuse `timerStopped`.

### Événements serveur → client
- `sessionCreated` `{ session }`
- `currentSession` `{ sessionCode, sessionData, connectedClients }`
- `playerJoined` `{ playerId, playerLabel, playerRole, session }` - `playerRole` est obligatoire
- `playerLeft` `{ playerId, session }`
- `gameStarted` `{ session, moduleManuals (sans solutions), solutionsDistribution, solutionsByAnalyste }`
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

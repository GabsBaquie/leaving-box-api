## Timer partagé

Le timer est piloté via WebSockets et persiste son état dans Redis.

### Démarrage
- Événement : `startTimer { sessionCode }`
- Pré-conditions : session existante et `timerStarted === false`.
- Initialisation : `remaining = maxTime` puis stockage dans Redis via `updateTimer`.
- Diffusion immédiate : `timerUpdate { remaining }`.

### Boucle d’exécution
- Intervalle 1s par session (stocké dans `sessionTimers[sessionCode]`).
- À chaque tick :
  - décrémente `remaining`
  - persiste `remainingTime` dans Redis
  - émet `timerUpdate { remaining }`

### Fin du timer
- Quand `remaining <= 0` :
  - arrêt de l’intervalle + suppression de l’entrée `sessionTimers`
  - `remainingTime` forcé à 0 en Redis
  - émission `gameOver { message: 'Le temps est écoulé !' }`

### Arrêt manuel
- Événement : `stopTimer { sessionCode }`
- Effets :
  - stoppe l’intervalle si existant
  - remet `remainingTime` à 0 via `updateTimer`
  - émet `timerStopped { sessionCode }`

### Nettoyage de session
- `clearSession` :
  - supprime la clé Redis de session
  - arrête le timer et efface `sessionTimers[sessionCode]`
  - éjecte les sockets de la room et diffuse `sessionCleared`

### Points de vigilance
- Pas de reprise de timer après restart du serveur (l’intervalle est en mémoire). Si besoin, recharger `remainingTime` depuis Redis et relancer un intervalle.
- Pas de TTL Redis : ajouter une expiration sur `session:{code}` pour auto-nettoyer.

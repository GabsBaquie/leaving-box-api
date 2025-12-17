## Configuration et dépendances

### Variables d’environnement
- `PORT` (défaut 3000)
- `DATABASE_URL` : URI MongoDB
- `REDIS_HOST` / `REDIS_PORT` : accès Redis (défaut localhost:6379)
- `NODE_ENV` : `development` ou `production`

Le module Config charge :  
- `./environment/.env.dev` en développement  
- `./environment/.env.prod` en production

### Services externes
- **Redis** : stockage des sessions (`session:{code}`) et du timer (`remainingTime`, `timerStarted`, `players[]`, etc.).
- **MongoDB** : persistance des modules de jeu.

### Documentation et ressources
- **Swagger** : `http://localhost:3000/api`
- **Manuels PDF** : servis sur `/manuals` depuis `public/manuals` (ex: `module-simon.pdf`).

### Ports et réseau
- API HTTP : `PORT` (0.0.0.0)
- Socket.IO : même port que l’API (namespace par défaut)

### Pistes d’amélioration
- Ajouter une TTL Redis pour auto-purger les sessions inactives.
- Sécuriser CORS Socket.IO et restreindre qui peut appeler `startGame`/`startTimer`.
- Recharger les timers au démarrage en lisant `remainingTime` depuis Redis si besoin de reprise.

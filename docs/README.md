## Documentation fonctionnelle

Un document par fonctionnalité. Chaque page est autonome et indique les flux, payloads et effets côté serveur.

- `websocket-sessions.md` : flux temps réel (Socket.IO) pour gérer les parties.
- `timer.md` : fonctionnement du compte à rebours partagé par session.
- `modules.md` : modèle Mongo et endpoints CRUD des modules.
- `rest-api.md` : endpoints HTTP disponibles (sessions + modules) et Swagger.
- `configuration.md` : variables d’environnement, services externes et ressources statiques.
- `roles.md` : rôles attendus (agent / operator) et droits effectifs.
- `avancements/` : journaux datés des évolutions (ex: `2025-12-17.md`).
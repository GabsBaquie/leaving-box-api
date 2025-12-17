## API REST

Swagger : `http://localhost:3000/api`.

### Sessions
- `GET /sessions`  
  Retourne les clés Redis des sessions actives (`session:{code}`).
- `GET /sessions/:sessionCode`  
  Réponse `{ success: boolean, session?: Session }` ou message d’erreur.  
  Session = `{ id, code, maxTime, remainingTime, timerStarted, createdAt, players[], started }`.

### Modules
Voir détails dans `modules.md`. CRUD complet :
- `POST /module`
- `GET /module`
- `GET /module/:id`
- `PUT /module/:id`
- `DELETE /module/:id/delete`

### Ressources statiques
- `GET /manuals/:file` sert les PDF présents dans `public/manuals` (ex: `module-simon.pdf`).

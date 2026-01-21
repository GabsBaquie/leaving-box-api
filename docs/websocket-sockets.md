# Documentation des WebSockets - API Leaving Box

Cette documentation détaille tous les sockets disponibles dans l'API, ce que le front-end doit envoyer et ce qu'il recevra en retour.

## Table des matières

1. [Sockets d'émission (Front → Back)](#sockets-démission-front--back)
2. [Événements de réception (Back → Front)](#événements-de-réception-back--front)
3. [Gestion des erreurs](#gestion-des-erreurs)

---

## Sockets d'émission (Front → Back)

### 1. `createSession`

**Description** : Crée une nouvelle session de jeu. Seul un agent peut créer une session.

**Qui peut l'utiliser** : Agent uniquement

**Données à envoyer** :
```typescript
{
  difficulty: 'Easy' | 'Medium' | 'Hard';
  role?: 'agent' | 'operator'; // Optionnel, mais si fourni, doit être 'agent'
}
```

**Comportement** :
- Crée une session avec un code unique (6 caractères alphanumériques)
- Le temps maximum dépend de la difficulté :
  - `Easy` : 900 secondes (15 minutes)
  - `Medium` : 600 secondes (10 minutes)
  - `Hard` : 60 secondes (1 minute) - actuellement en mode test
- Le client qui crée la session est automatiquement ajouté comme agent
- Toutes les autres sessions du client sont supprimées
- Le client rejoint automatiquement la room de la session créée

**Réponse** :
- **Succès** : Événement `sessionCreated` émis au client avec les données de la session
- **Erreur** : Événement `error` émis avec `{ message: 'Failed to create session' }`
- **Retour de fonction** : `{ success: false, message: '...' }` si le rôle n'est pas 'agent'

**Exemple d'utilisation** :
```typescript
socket.emit('createSession', {
  difficulty: 'Medium',
  role: 'agent'
});

socket.on('sessionCreated', (session) => {
  console.log('Session créée:', session.code);
});
```

---

### 2. `getSession`

**Description** : Récupère les informations d'une session existante. Peut également détecter automatiquement les retours en arrière si un opérateur envoie son chemin actuel.

**Qui peut l'utiliser** : Agent et Opérateurs

**Données à envoyer** :
```typescript
{
  sessionCode: string; // Code de la session (6 caractères)
  currentPath?: string; // Optionnel : chemin actuel de l'opérateur pour détection de retour en arrière
}
```

**Comportement** :
- Récupère les données complètes de la session depuis Redis
- Si un opérateur envoie `currentPath`, le système :
  - Enregistre l'action comme une navigation
  - Détecte automatiquement un retour en arrière en comparant avec l'historique
  - Si un retour en arrière est détecté, notifie l'agent via l'événement `operatorBackNavigation`
- Envoie les informations de la session et des clients connectés uniquement si le client fait partie de la session

**Réponse** :
- **Succès** : Événement `currentSession` émis au client avec :
  ```typescript
  {
    sessionCode: string;
    sessionData: Session; // Objet Session complet
    connectedClients: Array<{
      id: string;
      rooms: string[];
    }>;
  }
  ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si la session n'existe pas

**Exemple d'utilisation** :
```typescript
socket.emit('getSession', {
  sessionCode: 'ABC123',
  currentPath: '/module/1' // Pour les opérateurs
});

socket.on('currentSession', (data) => {
  console.log('Session actuelle:', data.sessionData);
});
```

---

### 3. `joinSession`

**Description** : Permet à un opérateur de rejoindre une session existante.

**Qui peut l'utiliser** : Opérateurs uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string; // Code de la session à rejoindre
  player: string; // Nom/label du joueur (non utilisé actuellement dans le backend)
}
```

**Comportement** :
- Le client quitte toutes les autres rooms (sauf sa propre room)
- Le client rejoint la room de la session
- Un nouveau joueur opérateur est ajouté à la session avec un label automatique (ex: "operator 1", "operator 2")
- Tous les clients de la session sont notifiés qu'un nouveau joueur a rejoint

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true }`
  - Événement `playerJoined` émis à TOUS les clients de la session :
    ```typescript
    {
      playerId: string;
      playerLabel: string; // ex: "operator 1"
      session: Session; // Session mise à jour avec le nouveau joueur
    }
    ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si la session n'existe pas

**Exemple d'utilisation** :
```typescript
socket.emit('joinSession', {
  sessionCode: 'ABC123',
  player: 'John'
});

socket.on('playerJoined', (data) => {
  console.log('Nouveau joueur:', data.playerLabel);
});
```

---

### 4. `leaveSession`

**Description** : Permet à un joueur de quitter une session.

**Qui peut l'utiliser** : Agent et Opérateurs

**Données à envoyer** :
```typescript
{
  sessionCode: string;
  player: string; // Nom/label du joueur (non utilisé actuellement)
  role: 'agent' | 'operator'; // Role du joueur
}
```

**Comportement** :
- Retire le joueur de la session dans Redis
- Le client quitte la room de la session
- **Vérifie qu'il reste au moins 1 agent ET 1 opérateur dans la session**
- **Si cette condition n'est pas respectée, la session est automatiquement fermée et nettoyée**
- Si la session reste active, tous les clients restants sont notifiés que le joueur a quitté

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true, sessionClosed?: boolean }`
    - Si `sessionClosed: true`, la session a été fermée car il ne restait pas au moins 1 agent et 1 opérateur
  - Si la session reste active : Événement `playerLeft` émis à TOUS les clients restants de la session :
    ```typescript
    {
      playerId: string;
      session: Session; // Session mise à jour sans le joueur
    }
    ```
  - Si la session est fermée : Événement `gameOver` émis à tous les clients :
    ```typescript
    {
      message: string; // Raison de la fermeture
      sessionCode: string;
    }
    ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si la session n'existe pas

**Exemple d'utilisation** :
```typescript
socket.emit('leaveSession', {
  sessionCode: 'ABC123',
  player: 'John'
});

socket.on('playerLeft', (data) => {
  console.log('Joueur parti:', data.playerId);
});
```

---

### 5. `startGame`

**Description** : Démarre la partie. Charge les modules et distribue les solutions aux opérateurs.

**Qui peut l'utiliser** : Agent uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string;
}
```

**Comportement** :
- Vérifie que la session existe et que le client est bien l'agent
- Vérifie qu'au moins un opérateur est présent
- Met à jour la session avec `started: true`
- Charge 5 modules aléatoires depuis la base de données
- Distribue les solutions de chaque module aux opérateurs (chaque opérateur reçoit une partie des solutions)
- Les modules sont envoyés SANS leurs solutions (pour éviter la triche)
- Les solutions sont distribuées séparément via `solutionsDistribution` et `solutionsByOperator`

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true }`
  - Événement `gameStarted` émis à TOUS les clients de la session :
    ```typescript
    {
      session: Session; // Session mise à jour avec started: true
      moduleManuals: Array<Module>; // Modules SANS les solutions
      solutionsDistribution: Array<{
        moduleId: string;
        allocations: Array<{
          recipientId: string;
          solutionIndex: number;
        }>;
      }>;
      solutionsByOperator: Record<string, Array<{
        moduleId: string;
        solutionIndex: number;
      }>>; // Solutions organisées par opérateur
    }
    ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas l'agent
  - Aucun opérateur n'est présent

**Exemple d'utilisation** :
```typescript
socket.emit('startGame', {
  sessionCode: 'ABC123'
});

socket.on('gameStarted', (data) => {
  console.log('Modules:', data.moduleManuals);
  console.log('Mes solutions:', data.solutionsByOperator[socket.id]);
});
```

---

### 6. `clearSession`

**Description** : Supprime complètement une session et arrête le timer.

**Qui peut l'utiliser** : Agent et Opérateurs (si aucun autre opérateur n'est présent)

**Remarque** : Si un opérateur essaie de supprimer la session, la session est fermée si aucun autre opérateur n'est présent.

**Données à envoyer** :
```typescript
{
  sessionCode: string;
}
```

**Comportement** :
- Vérifie que le client est bien l'agent
- Vérifie que aucun autre opérateur n'est présent
- Supprime la session de Redis
- Arrête le timer si actif
- Éjecte tous les clients de la room de la session
- Notifie tous les clients que la session a été supprimée

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true }`
  - Événement `sessionCleared` émis à TOUS les clients :
    ```typescript
    {
      sessionCode: string;
    }
    ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas l'agent

**Exemple d'utilisation** :
```typescript
socket.emit('clearSession', {
  sessionCode: 'ABC123'
});

socket.on('sessionCleared', (data) => {
  console.log('Session supprimée:', data.sessionCode);
});
```

---

### 7. `startTimer`

**Description** : Démarre le timer de la partie.

**Qui peut l'utiliser** : Agent uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string;
}
```

**Comportement** :
- Vérifie que la session existe et qu'au moins un opérateur est présent
- Vérifie que le timer n'est pas déjà démarré
- Met à jour la session avec `timerStarted: true`
- Démarre un interval qui décrémente le temps restant chaque seconde
- Envoie des mises à jour du timer toutes les secondes à tous les clients

**Réponse** :
- **Succès** : Retour de fonction `{ success: true }`
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas l'agent
  - Aucun opérateur n'est présent
  - Le timer est déjà démarré

**Événements émis automatiquement** :
- `timerUpdate` : Émis toutes les secondes à tous les clients de la session
  ```typescript
  {
    remaining: number; // Temps restant en secondes
  }
  ```
- `gameOver` : Émis quand le temps atteint 0
  ```typescript
  {
    message: 'Le temps est écoulé !';
  }
  ```

**Exemple d'utilisation** :
```typescript
socket.emit('startTimer', {
  sessionCode: 'ABC123'
});

socket.on('timerUpdate', (data) => {
  console.log('Temps restant:', data.remaining);
});

socket.on('gameOver', (data) => {
  console.log('Partie terminée:', data.message);
});
```

---

### 8. `stopTimer`

**Description** : Arrête le timer de la partie.

**Qui peut l'utiliser** : Agent uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string;
}
```

**Comportement** :
- Vérifie que la session existe
- Vérifie que le client est bien l'agent
- Arrête l'interval du timer
- Met à jour la session avec `remainingTime: 0`

**Réponse** :
- **Succès** : Retour de fonction `{ success: true }`
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas l'agent

**Événements émis** :
- `timerStopped` : Émis à tous les clients de la session
  ```typescript
  {
    sessionCode: string;
  }
  ```

**Exemple d'utilisation** :
```typescript
socket.emit('stopTimer', {
  sessionCode: 'ABC123'
});

socket.on('timerStopped', (data) => {
  console.log('Timer arrêté pour:', data.sessionCode);
});
```

---

### 9. `operatorAction`

**Description** : Enregistre une action d'un opérateur (navigation, interaction, etc.) pour suivre l'historique et détecter les retours en arrière.

**Qui peut l'utiliser** : Opérateurs uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string;
  action: string; // Type d'action : 'navigate', 'interact', 'click', etc.
  data?: Record<string, unknown>; // Données supplémentaires (path, state, url, etc.)
}
```

**Comportement** :
- Vérifie que le client est un opérateur dans la session
- Enregistre l'action dans l'historique de la session (limité à 100 actions)
- Détecte automatiquement un retour en arrière en comparant avec les actions précédentes
- Si un retour en arrière est détecté, notifie automatiquement l'agent

**Réponse** :
- **Succès** : Retour de fonction `{ success: true }`
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas un opérateur

**Événements émis automatiquement** :
- Si un retour en arrière est détecté, l'agent reçoit `operatorBackNavigation` :
  ```typescript
  {
    sessionCode: string;
    operatorId: string;
    operatorLabel: string;
    timestamp: Date;
    autoDetected: true;
    action: string;
    data?: Record<string, unknown>;
  }
  ```

**Exemple d'utilisation** :
```typescript
// Enregistrer une navigation
socket.emit('operatorAction', {
  sessionCode: 'ABC123',
  action: 'navigate',
  data: {
    path: '/module/1',
    state: 'viewing-module-1'
  }
});

// Enregistrer une interaction
socket.emit('operatorAction', {
  sessionCode: 'ABC123',
  action: 'click',
  data: {
    element: 'button-submit',
    moduleId: 'module-1'
  }
});
```

---

### 10. `back` (alias de `operatorBackNavigation`)

**Description** : Version simplifiée pour signaler un retour en arrière. Redirige vers `operatorBackNavigation`.

**Qui peut l'utiliser** : Opérateurs et Agent

**Données à envoyer** :
```typescript
{
  sessionCode: string;
}
```

**Comportement** : Identique à `operatorBackNavigation` (voir ci-dessous)

---

### 11. `operatorBackNavigation`

**Description** : Signale explicitement un retour en arrière effectué par un opérateur ou l'agent.

**Qui peut l'utiliser** : Opérateurs et Agent

**Données à envoyer** :
```typescript
{
  sessionCode: string;
  path?: string; // Optionnel : chemin actuel
  state?: string; // Optionnel : état actuel de l'application
}
```

**Comportement** :
- Si c'est l'agent qui signale : l'action est enregistrée mais l'agent n'est pas notifié
- Si c'est un opérateur qui signale :
  - L'action est enregistrée dans l'historique
  - L'agent est notifié via l'événement `operatorBackNavigation`
  - Tous les clients de la session reçoivent aussi `operatorBackNavigationDetected` (pour debug)

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true, data?: {...} }`
  - Pour les opérateurs : données de notification incluses dans la réponse
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le joueur n'est pas dans la session

**Événements émis** :
- Pour l'agent uniquement : `operatorBackNavigation`
  ```typescript
  {
    sessionCode: string;
    operatorId: string;
    operatorLabel: string;
    timestamp: Date;
    path?: string;
    state?: string;
  }
  ```
- Pour tous les clients (debug) : `operatorBackNavigationDetected`
  ```typescript
  {
    sessionCode: string;
    operatorId: string;
    operatorLabel: string;
    timestamp: Date;
  }
  ```

**Exemple d'utilisation** :
```typescript
socket.emit('operatorBackNavigation', {
  sessionCode: 'ABC123',
  path: '/module/1',
  state: 'viewing-module-1'
});

// Écouter les retours en arrière (pour l'agent)
socket.on('operatorBackNavigation', (data) => {
  console.log('Retour en arrière détecté:', data.operatorLabel);
});
```

---

### 12. `getOperatorActions`

**Description** : Récupère l'historique des actions d'un ou tous les opérateurs.

**Qui peut l'utiliser** : Agent uniquement

**Données à envoyer** :
```typescript
{
  sessionCode: string;
  operatorId?: string; // Optionnel : pour filtrer les actions d'un opérateur spécifique
}
```

**Comportement** :
- Vérifie que le client est bien l'agent
- Récupère l'historique des actions depuis la session
- Si `operatorId` est fourni, filtre les actions de cet opérateur uniquement
- Envoie l'historique au client via un événement dédié

**Réponse** :
- **Succès** : 
  - Retour de fonction `{ success: true }`
  - Événement `operatorActionsHistory` émis au client :
    ```typescript
    {
      sessionCode: string;
      operatorId?: string;
      actions: Array<OperatorAction>; // Array d'actions
    }
    ```
- **Erreur** : Retour de fonction `{ success: false, message: '...' }` si :
  - La session n'existe pas
  - Le client n'est pas l'agent

**Type `OperatorAction`** :
```typescript
{
  operatorId: string;
  action: string; // 'navigate', 'interact', 'back', etc.
  timestamp: Date;
  data?: Record<string, unknown>; // Données supplémentaires
}
```

**Exemple d'utilisation** :
```typescript
// Récupérer toutes les actions
socket.emit('getOperatorActions', {
  sessionCode: 'ABC123'
});

// Récupérer les actions d'un opérateur spécifique
socket.emit('getOperatorActions', {
  sessionCode: 'ABC123',
  operatorId: 'socket-id-123'
});

socket.on('operatorActionsHistory', (data) => {
  console.log('Historique des actions:', data.actions);
});
```

---

## Événements de réception (Back → Front)

Ces événements sont émis automatiquement par le serveur et doivent être écoutés par le front-end.

### 1. `sessionCreated`
- **Émis quand** : Une session est créée avec succès
- **Reçu par** : Le client qui a créé la session
- **Données** : Objet `Session` complet

### 2. `currentSession`
- **Émis quand** : Une requête `getSession` réussit et le client fait partie de la session
- **Reçu par** : Le client qui a demandé la session
- **Données** : `{ sessionCode, sessionData, connectedClients }`

### 3. `playerJoined`
- **Émis quand** : Un nouveau joueur rejoint la session
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ playerId, playerLabel, session }`

### 4. `playerLeft`
- **Émis quand** : Un joueur quitte la session (volontairement ou par déconnexion)
- **Reçu par** : TOUS les clients restants de la session
- **Données** : `{ playerId, session }`

### 5. `gameStarted`
- **Émis quand** : La partie démarre avec succès
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ session, moduleManuals, solutionsDistribution, solutionsByOperator }`

### 6. `sessionCleared`
- **Émis quand** : Une session est supprimée
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ sessionCode }`

### 7. `timerUpdate`
- **Émis quand** : Le timer est actif et se met à jour chaque seconde
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ remaining }` (temps restant en secondes)

### 8. `timerStopped`
- **Émis quand** : Le timer est arrêté manuellement
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ sessionCode }`

### 9. `gameOver`
- **Émis quand** : 
  - Le timer atteint 0
  - L'agent se déconnecte
  - Tous les opérateurs se déconnectent
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ message: string, sessionCode?: string }`

### 10. `operatorBackNavigation`
- **Émis quand** : Un opérateur fait un retour en arrière (détecté automatiquement ou signalé)
- **Reçu par** : L'agent uniquement
- **Données** : `{ sessionCode, operatorId, operatorLabel, timestamp, path?, state?, autoDetected? }`

### 11. `operatorBackNavigationDetected`
- **Émis quand** : Un retour en arrière est détecté (pour debug)
- **Reçu par** : TOUS les clients de la session
- **Données** : `{ sessionCode, operatorId, operatorLabel, timestamp }`

### 12. `operatorActionsHistory`
- **Émis quand** : Une requête `getOperatorActions` réussit
- **Reçu par** : L'agent qui a fait la requête
- **Données** : `{ sessionCode, operatorId?, actions }`

### 13. `error`
- **Émis quand** : Une erreur survient lors de certaines opérations
- **Reçu par** : Le client concerné
- **Données** : `{ message: string }`

---

## Gestion des erreurs

Tous les sockets retournent un objet avec `success: boolean` et optionnellement `message: string` en cas d'erreur.

**Pattern de gestion d'erreur recommandé** :
```typescript
socket.emit('someSocket', data, (response) => {
  if (!response.success) {
    console.error('Erreur:', response.message);
    // Gérer l'erreur dans l'UI
  }
});
```

**Événements d'erreur** :
- Certains sockets émettent aussi l'événement `error` en cas d'échec critique
- Toujours écouter `error` pour capturer les erreurs non gérées :
```typescript
socket.on('error', (error) => {
  console.error('Erreur WebSocket:', error.message);
});
```

---

## Structure des types TypeScript

### Session
```typescript
interface Session {
  id: string;
  code: string; // 6 caractères alphanumériques
  agentId: string;
  maxTime: number; // Temps maximum en secondes
  remainingTime: number; // Temps restant en secondes
  timerStarted: boolean;
  createdAt: Date;
  players: Player[];
  started: boolean;
  operatorActions?: OperatorAction[];
}
```

### Player
```typescript
type PlayerRole = 'agent' | 'operator';

interface Player {
  id: string; // Socket ID
  role: PlayerRole;
  label: string; // ex: "agent", "operator 1", "operator 2"
}
```

### OperatorAction
```typescript
interface OperatorAction {
  operatorId: string;
  action: string; // 'navigate', 'interact', 'back', 'getSession', etc.
  timestamp: Date;
  data?: Record<string, unknown>; // Données contextuelles
}
```

---

## Notes importantes

1. **Déconnexion automatique** :
   - Si l'agent se déconnecte, la session est automatiquement fermée
   - Si tous les opérateurs se déconnectent, la session est automatiquement fermée
   - Un événement `gameOver` est émis dans ces cas

2. **Détection automatique des retours en arrière** :
   - Le système détecte automatiquement les retours en arrière via `operatorAction` et `getSession`
   - Il compare les chemins/états actuels avec l'historique des 20 dernières actions
   - L'agent est notifié automatiquement

3. **Distribution des solutions** :
   - Les solutions sont distribuées de manière équitable entre les opérateurs
   - Chaque opérateur reçoit une partie des solutions de chaque module
   - Les modules sont envoyés SANS leurs solutions pour éviter la triche

4. **Limites** :
   - L'historique des actions est limité à 100 actions par session
   - La détection de retour en arrière cherche dans les 20 dernières actions

5. **Rooms Socket.IO** :
   - Chaque session correspond à une room Socket.IO
   - Les clients rejoignent automatiquement la room lors de `createSession` ou `joinSession`
   - Les événements de broadcast sont envoyés à tous les clients de la room

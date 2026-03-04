# Guide Développeur - Gameplay Leaving Box

## Vue d'ensemble

Le système Leaving Box est une API NestJS qui gère des sessions de jeu en temps réel via WebSockets (Socket.IO). Le jeu consiste en une session où un **agent** crée une partie et des **opérateurs** rejoignent pour résoudre des modules de jeu dans un temps limité.

### Architecture technique
- **Backend** : NestJS + TypeScript
- **WebSockets** : Socket.IO Gateway pour la communication temps réel
- **Stockage sessions** : Redis (clé `session:{code}`)
- **Stockage modules** : MongoDB (Mongoose)
- **API REST** : Swagger disponible sur `/api`
- **Ressources statiques** : PDF servis sur `/manuals/:file`

---

## Concepts clés

### Rôles

#### Agent
- **Rôle** : Créateur et gestionnaire de la session
- **Permissions** : Création de session, démarrage du jeu, contrôle du timer, nettoyage de session
- **Identification** : `socket.id` stocké dans `session.agentId`
- **Label** : `"agent"`

#### Operator
- **Rôle** : Participant qui résout les modules
- **Permissions** : Rejoindre/quitter une session, recevoir les modules et solutions
- **Identification** : `socket.id` stocké dans `session.players[]`
- **Label** : `"operator N"` (numérotation automatique : operator 1, operator 2, etc.)

### Session

Une session représente une partie de jeu avec :
- **Code unique** : 6 caractères alphanumériques majuscules (ex: `A1B2C3`)
- **Difficulté** : `Easy` (900s), `Medium` (600s), `Hard` (60s)
- **Timer** : Compte à rebours partagé entre tous les participants
- **Modules** : 4 modules aléatoires tirés au démarrage du jeu
- **Solutions** : Réparties entre les opérateurs selon un système de round-robin

### Module

Un module représente un défi à résoudre avec :
- **Nom** : Identifiant unique
- **Description** : Explication du module
- **Règles** : Instructions de résolution (visibles par tous)
- **Solutions** : Étapes détaillées (réparties entre opérateurs uniquement)
- **Image** : URL optionnelle pour l'affichage

---

## API REST

### Sessions

#### `GET /sessions`
**Description** : Liste toutes les clés Redis des sessions actives

**Réponse** :
```json
[
  "session:A1B2C3",
  "session:XYZ789"
]
```

**Appel frontend** :
```typescript
const response = await fetch('http://localhost:3000/sessions');
const sessionKeys = await response.json();
```

---

#### `GET /sessions/:sessionCode`
**Description** : Récupère les détails d'une session spécifique

**Paramètres** :
- `sessionCode` (path) : Code de la session (ex: `A1B2C3`)

**Réponse succès** :
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "code": "A1B2C3",
    "agentId": "socket-id-agent",
    "maxTime": 900,
    "remainingTime": 850,
    "timerStarted": true,
    "createdAt": "2025-01-17T10:00:00.000Z",
    "players": [
      {
        "id": "socket-id-agent",
        "role": "agent",
        "label": "agent"
      },
      {
        "id": "socket-id-operator-1",
        "role": "operator",
        "label": "operator 1"
      }
    ],
    "started": true,
    "operatorActions": []
  }
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Session not found"
}
```

**Appel frontend** :
```typescript
const response = await fetch(`http://localhost:3000/sessions/${sessionCode}`);
const data = await response.json();
if (data.success) {
  const session = data.session;
}
```

---

### Modules

#### `POST /module`
**Description** : Crée un nouveau module

**Body** :
```json
{
  "name": "Module Simon",
  "description": "Mémorisez la séquence de couleurs",
  "rules": "Appuyez sur les boutons dans l'ordre indiqué",
  "imgUrl": "https://example.com/simon.jpg",
  "solutions": [
    "Appuyer sur rouge",
    "Appuyer sur bleu",
    "Appuyer sur vert",
    "Appuyer sur jaune"
  ]
}
```

**Réponse** : Module créé (avec `_id` MongoDB)

**Appel frontend** :
```typescript
const response = await fetch('http://localhost:3000/module', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Module Simon',
    description: 'Mémorisez la séquence de couleurs',
    rules: 'Appuyez sur les boutons dans l\'ordre indiqué',
    solutions: ['Étape 1', 'Étape 2']
  })
});
const module = await response.json();
```

---

#### `GET /module`
**Description** : Liste tous les modules

**Réponse** : Tableau de modules
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Module Simon",
    "description": "...",
    "rules": "...",
    "solutions": ["...", "..."],
    "imgUrl": "..."
  }
]
```

**Appel frontend** :
```typescript
const response = await fetch('http://localhost:3000/module');
const modules = await response.json();
```

---

#### `GET /module/:id`
**Description** : Récupère un module spécifique

**Paramètres** :
- `id` (path) : ID MongoDB du module

**Réponse** : Module complet ou `null`

**Appel frontend** :
```typescript
const response = await fetch(`http://localhost:3000/module/${moduleId}`);
const module = await response.json();
```

---

#### `PUT /module/:id`
**Description** : Met à jour un module

**Paramètres** :
- `id` (path) : ID MongoDB du module

**Body** : Même structure que `POST /module`

**Réponse** : Module mis à jour

**Appel frontend** :
```typescript
const response = await fetch(`http://localhost:3000/module/${moduleId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updatedModule)
});
const module = await response.json();
```

---

#### `DELETE /module/:id/delete`
**Description** : Supprime un module

**Paramètres** :
- `id` (path) : ID MongoDB du module

**Réponse** : Module supprimé ou `null`

**Appel frontend** :
```typescript
const response = await fetch(`http://localhost:3000/module/${moduleId}/delete`, {
  method: 'DELETE'
});
const deletedModule = await response.json();
```

---

### Ressources statiques

#### `GET /manuals/:file`
**Description** : Sert les fichiers PDF présents dans `public/manuals`

**Exemple** : `GET /manuals/module-simon.pdf`

**Appel frontend** :
```typescript
// Dans un composant React/Next.js
<iframe src="http://localhost:3000/manuals/module-simon.pdf" />

// Ou téléchargement
window.open(`http://localhost:3000/manuals/${filename}`);
```

---

## WebSockets (Socket.IO)

### Connexion

**URL** : `ws://localhost:3000` (ou l'URL de votre serveur)

**CORS** : Actuellement ouvert à toutes les origines (`origin: *`)

**Appel frontend** :
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connecté avec socket.id:', socket.id);
});
```

---

## Événements Client → Serveur

### `createSession`
**Description** : Crée une nouvelle session de jeu (Agent uniquement)

**Payload** :
```typescript
{
  difficulty: 'Easy' | 'Medium' | 'Hard';
  gameMode?: 'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT'; // Optionnel, défaut: 'ONE_OPERATOR_ONE_MODULE'
  role: 'agent' | 'operator'; // OBLIGATOIRE - doit être 'agent' pour créer une session
}
```

**Validation** :
- `role` est obligatoire et doit être `'agent'` pour créer une session
- Si `role` n'est pas fourni, retourne une erreur "Role is required"
- Si `role` est différent de `'agent'`, retourne une erreur "Only an agent can create a session"
- Le `socket.id` du client est automatiquement utilisé comme `agentId`

**Réponse succès** : Événement `sessionCreated` émis au client

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Role is required"
}
```
ou
```json
{
  "success": false,
  "message": "Only an agent can create a session"
}
```

**Appel frontend** :
```typescript
// Agent crée une session
socket.emit('createSession', {
  difficulty: 'Medium',
  gameMode: 'ONE_OPERATOR_ONE_MODULE', // Optionnel
  role: 'agent' // OBLIGATOIRE
});

socket.on('sessionCreated', (session) => {
  console.log('Session créée:', session.code);
  // session = { id, code, agentId, maxTime, remainingTime, ... }
});
```

**Durées selon difficulté** :
- `Easy` : 900 secondes (15 minutes)
- `Medium` : 600 secondes (10 minutes)
- `Hard` : 60 secondes (1 minute)

---

### `getSession`
**Description** : Récupère l'état actuel d'une session et la liste des clients connectés

**Payload** :
```typescript
{
  sessionCode: string;
  currentPath?: string; // Optionnel : chemin actuel pour détecter les retours en arrière
}
```

**Comportement** :
- Si le client est dans la room de la session, émet `currentSession`
- Si `currentPath` est fourni et que le client est un opérateur, enregistre l'action et détecte automatiquement les retours en arrière
- Si un retour en arrière est détecté, émet `operatorBackNavigation` à l'agent

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Session with code A1B2C3 does not exist"
}
```

**Événement reçu** : `currentSession`

**Appel frontend** :
```typescript
// Récupérer l'état de la session
socket.emit('getSession', {
  sessionCode: 'A1B2C3',
  currentPath: '/module/1' // Optionnel pour détecter les retours en arrière
});

socket.on('currentSession', (data) => {
  console.log('Session actuelle:', data.sessionData);
  console.log('Clients connectés:', data.connectedClients);
  // data = { sessionCode, sessionData, connectedClients }
});
```

---

### `joinSession`
**Description** : Rejoint une session en tant qu'opérateur

**Payload** :
```typescript
{
  sessionCode: string;
  player: string; // Nom du joueur (actuellement non utilisé, mais requis)
}
```

**Comportement** :
- Le socket quitte automatiquement toutes ses autres rooms (sauf son propre ID)
- Rejoint la room de la session
- Ajoute un opérateur avec un label automatique (`operator 1`, `operator 2`, etc.)
- Émet `playerJoined` à tous les clients de la session

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Session with code A1B2C3 does not exist"
}
```

**Événement reçu** : `playerJoined` (diffusé à tous)

**Appel frontend** :
```typescript
// Opérateur rejoint une session
socket.emit('joinSession', {
  sessionCode: 'A1B2C3',
  player: 'John Doe'
});

socket.on('playerJoined', (data) => {
  console.log('Joueur rejoint:', data.playerLabel);
  console.log('Rôle:', data.playerRole);
  // data = { playerId, playerLabel, playerRole, session }
});
```

---

### `leaveSession`
**Description** : Quitte une session

**Payload** :
```typescript
{
  sessionCode: string;
  player: string; // Nom du joueur (actuellement non utilisé, mais requis)
}
```

**Comportement** :
- Retire le joueur de la session Redis
- Quitte la room Socket.IO
- Si l'agent quitte, la session est automatiquement fermée
- Si tous les opérateurs quittent, la session est automatiquement fermée
- Émet `playerLeft` à tous les clients restants
- Si la session est fermée, émet `gameOver` avec le message de fermeture

**Réponse succès** :
```json
{
  "success": true,
  "sessionClosed": false // true si la session a été fermée
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Session with code A1B2C3 does not exist"
}
```

**Événements reçus** :
- `playerLeft` (si la session reste active)
- `gameOver` (si la session est fermée)

**Appel frontend** :
```typescript
// Quitter une session
socket.emit('leaveSession', {
  sessionCode: 'A1B2C3',
  player: 'John Doe'
});

socket.on('playerLeft', (data) => {
  console.log('Joueur parti:', data.playerId);
  // data = { playerId, session }
});

socket.on('gameOver', (data) => {
  console.log('Session fermée:', data.message);
  // data = { message, sessionCode? }
});
```

---

### `startGame`
**Description** : Démarre le jeu en sélectionnant 5 modules aléatoires (Agent uniquement)

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Validation** :
- Vérifie que `session.agentId === socket.id`
- Vérifie qu'au moins un opérateur est présent dans la session

**Comportement** :
- Met `started: true` dans la session
- Sélectionne 5 modules aléatoires via `moduleService.findSome(5)`
- Répartit les solutions entre les opérateurs selon un système round-robin
- Émet `gameStarted` à tous les clients de la session avec :
  - Les modules sans solutions (visibles par tous)
  - La distribution des solutions par opérateur

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only the agent can start the game"
}
```
ou
```json
{
  "success": false,
  "message": "At least one operator is required to start the game"
}
```

**Événement reçu** : `gameStarted`

**Appel frontend** :
```typescript
// Agent démarre le jeu
socket.emit('startGame', {
  sessionCode: 'A1B2C3'
});

socket.on('gameStarted', (data) => {
  console.log('Jeu démarré!');
  console.log('Modules:', data.moduleManuals);
  console.log('Solutions pour cet opérateur:', data.solutionsByOperator[socket.id]);
  // data = {
  //   session,
  //   moduleManuals: Module[] (sans solutions),
  //   solutionsDistribution: SolutionsDistribution[],
  //   solutionsByOperator: { [operatorId]: [{ moduleId, solutions[] }] }
  // }
});
```

**Structure des données reçues** :
```typescript
// moduleManuals : Modules sans solutions (visibles par tous)
[
  {
    _id: "module-id-1",
    name: "Module Simon",
    description: "...",
    rules: "...",
    imgUrl: "..."
    // Pas de solutions ici
  }
]

// solutionsByOperator : Solutions par opérateur
{
  "socket-id-operator-1": [
    {
      moduleId: "module-id-1",
      solutions: ["Étape 1", "Étape 2"]
    },
    {
      moduleId: "module-id-2",
      solutions: ["Étape 3"]
    }
  ],
  "socket-id-operator-2": [
    {
      moduleId: "module-id-1",
      solutions: ["Étape 3", "Étape 4"]
    }
  ]
}
```

---

### `startTimer`
**Description** : Démarre le timer partagé de la session (Agent uniquement)

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Validation** :
- Vérifie que `session.agentId === socket.id`
- Vérifie qu'au moins un opérateur est présent
- Vérifie que le timer n'est pas déjà démarré

**Comportement** :
- Met `timerStarted: true` dans la session
- Initialise le timer à `maxTime`
- Démarre un intervalle qui décrémente chaque seconde
- Émet `timerUpdate` toutes les secondes à tous les clients
- Quand le timer atteint 0, émet `gameOver`

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only the agent can start the timer"
}
```
ou
```json
{
  "success": false,
  "message": "At least one operator is required to start the timer"
}
```
ou
```json
{
  "success": false,
  "message": "Timer already started"
}
```

**Événements reçus** :
- `timerUpdate` (toutes les secondes)
- `gameOver` (quand le timer atteint 0)

**Appel frontend** :
```typescript
// Agent démarre le timer
socket.emit('startTimer', {
  sessionCode: 'A1B2C3'
});

socket.on('timerUpdate', (data) => {
  console.log('Temps restant:', data.remaining, 'secondes');
  // data = { remaining: number }
});

socket.on('gameOver', (data) => {
  console.log('Temps écoulé!', data.message);
  // data = { message: 'Le temps est écoulé !' }
});
```

---

### `stopTimer`
**Description** : Arrête le timer et remet le temps restant à 0 (Agent uniquement)

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Validation** :
- Vérifie que `session.agentId === socket.id`

**Comportement** :
- Arrête l'intervalle du timer
- Met `remainingTime: 0` dans la session
- Émet `timerStopped` à tous les clients

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only the agent can stop the timer"
}
```

**Événement reçu** : `timerStopped`

**Appel frontend** :
```typescript
// Agent arrête le timer
socket.emit('stopTimer', {
  sessionCode: 'A1B2C3'
});

socket.on('timerStopped', (data) => {
  console.log('Timer arrêté pour la session:', data.sessionCode);
  // data = { sessionCode: string }
});
```

---

### `clearSession`
**Description** : Supprime complètement une session (Agent uniquement)

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Validation** :
- Vérifie que `session.agentId === socket.id`

**Comportement** :
- Supprime la session de Redis
- Arrête le timer si actif
- Éjecte tous les sockets de la room
- Émet `sessionCleared` à tous les clients

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only the agent can clear the session"
}
```

**Événement reçu** : `sessionCleared`

**Appel frontend** :
```typescript
// Agent supprime la session
socket.emit('clearSession', {
  sessionCode: 'A1B2C3'
});

socket.on('sessionCleared', (data) => {
  console.log('Session supprimée:', data.sessionCode);
  // data = { sessionCode: string }
  // Tous les clients sont automatiquement déconnectés de la room
});
```

---

### `operatorAction`
**Description** : Enregistre une action d'un opérateur (navigation, interaction, etc.)

**Payload** :
```typescript
{
  sessionCode: string;
  action: string; // Ex: 'navigate', 'interact', 'click', etc.
  data?: Record<string, unknown>; // Données supplémentaires
}
```

**Validation** :
- Vérifie que le client est un opérateur dans la session

**Comportement** :
- Enregistre l'action dans `session.operatorActions[]`
- Détecte automatiquement les retours en arrière
- Si un retour en arrière est détecté, émet `operatorBackNavigation` à l'agent
- Limite l'historique à 100 actions par session

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only operators can send actions"
}
```

**Événement reçu** : `operatorBackNavigation` (à l'agent uniquement, si détection)

**Appel frontend** :
```typescript
// Opérateur enregistre une action
socket.emit('operatorAction', {
  sessionCode: 'A1B2C3',
  action: 'navigate',
  data: {
    path: '/module/1',
    timestamp: new Date().toISOString()
  }
});

// L'agent reçoit une notification si retour en arrière détecté
socket.on('operatorBackNavigation', (data) => {
  console.log('Retour en arrière détecté:', data.operatorLabel);
  // data = {
  //   sessionCode: string,
  //   operatorId: string,
  //   operatorLabel: string,
  //   timestamp: Date,
  //   autoDetected: boolean,
  //   action?: string,
  //   data?: Record<string, unknown>
  // }
});
```

---

### `back` / `operatorBackNavigation`
**Description** : Signale explicitement un retour en arrière (raccourci pour `operatorBackNavigation`)

**Payload** :
```typescript
{
  sessionCode: string;
  path?: string; // Optionnel : chemin actuel
  state?: string; // Optionnel : état actuel
}
```

**Comportement** :
- Si appelé par un opérateur : enregistre l'action et notifie l'agent
- Si appelé par l'agent : enregistre seulement l'action (pas de notification)

**Réponse succès** :
```json
{
  "success": true
}
```

**Appel frontend** :
```typescript
// Signaler un retour en arrière
socket.emit('back', {
  sessionCode: 'A1B2C3',
  path: '/module/1'
});

// Ou utiliser l'événement complet
socket.emit('operatorBackNavigation', {
  sessionCode: 'A1B2C3',
  path: '/module/1',
  state: 'module-view'
});
```

---

### `getOperatorActions`
**Description** : Récupère l'historique des actions d'un opérateur (Agent uniquement)

**Payload** :
```typescript
{
  sessionCode: string;
  operatorId?: string; // Optionnel : si non fourni, retourne toutes les actions
}
```

**Validation** :
- Vérifie que `session.agentId === socket.id`

**Comportement** :
- Retourne l'historique des actions depuis `session.operatorActions[]`
- Si `operatorId` est fourni, filtre les actions de cet opérateur uniquement
- Émet `operatorActionsHistory` au client

**Réponse succès** :
```json
{
  "success": true
}
```

**Réponse erreur** :
```json
{
  "success": false,
  "message": "Only the agent can view operator actions"
}
```

**Événement reçu** : `operatorActionsHistory`

**Appel frontend** :
```typescript
// Agent récupère l'historique des actions
socket.emit('getOperatorActions', {
  sessionCode: 'A1B2C3',
  operatorId: 'socket-id-operator-1' // Optionnel
});

socket.on('operatorActionsHistory', (data) => {
  console.log('Historique des actions:', data.actions);
  // data = {
  //   sessionCode: string,
  //   operatorId?: string,
  //   actions: OperatorAction[]
  // }
});
```

**Structure des actions** :
```typescript
type OperatorAction = {
  operatorId: string;
  action: string; // 'navigate', 'interact', 'back', etc.
  timestamp: Date;
  data?: Record<string, unknown>;
};
```

---

## Événements Serveur → Client

### `sessionCreated`
**Émis quand** : Une session est créée avec succès

**Payload** :
```typescript
{
  id: string;
  code: string;
  agentId: string;
  maxTime: number;
  remainingTime: number;
  timerStarted: false;
  createdAt: Date;
  players: Player[];
  started: false;
  operatorActions: [];
}
```

**Destinataire** : Client qui a créé la session (agent)

---

### `currentSession`
**Émis quand** : Un client demande l'état de la session via `getSession`

**Payload** :
```typescript
{
  sessionCode: string;
  sessionData: Session;
  connectedClients: Array<{
    id: string;
    rooms: string[];
  }>;
}
```

**Destinataire** : Client qui a appelé `getSession`

---

### `playerJoined`
**Émis quand** : Un opérateur rejoint une session

**Payload** :
```typescript
{
  playerId: string;
  playerLabel: string; // "operator 1", "operator 2", etc.
  playerRole: 'agent' | 'operator'; // OBLIGATOIRE - rôle du joueur
  session: Session;
}
```

**Destinataire** : Tous les clients de la session

---

### `playerLeft`
**Émis quand** : Un joueur quitte une session (si la session reste active)

**Payload** :
```typescript
{
  playerId: string;
  session: Session;
}
```

**Destinataire** : Tous les clients restants de la session

---

### `gameStarted`
**Émis quand** : Le jeu démarre (5 modules sélectionnés)

**Payload** :
```typescript
{
  session: Session;
  moduleManuals: Module[]; // Sans solutions
  solutionsDistribution: SolutionsDistribution[];
  solutionsByOperator: SolutionsByOperator;
}
```

**Destinataire** : Tous les clients de la session

**Détails** :
- `moduleManuals` : Modules sans solutions (visibles par tous)
- `solutionsDistribution` : Distribution brute des solutions par module
- `solutionsByOperator` : Solutions organisées par opérateur (clé = `socket.id`)

---

### `sessionCleared`
**Émis quand** : Une session est supprimée

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Destinataire** : Tous les clients de la session (avant éjection)

---

### `timerUpdate`
**Émis quand** : Le timer est mis à jour (toutes les secondes)

**Payload** :
```typescript
{
  remaining: number; // Temps restant en secondes
}
```

**Destinataire** : Tous les clients de la session

**Fréquence** : 1 fois par seconde quand le timer est actif

---

### `timerStopped`
**Émis quand** : Le timer est arrêté manuellement

**Payload** :
```typescript
{
  sessionCode: string;
}
```

**Destinataire** : Tous les clients de la session

---

### `gameOver`
**Émis quand** : 
- Le timer atteint 0
- La session est fermée (agent ou tous les opérateurs partis)

**Payload** :
```typescript
{
  message: string; // Ex: "Le temps est écoulé !" ou "L'agent a quitté la session"
  sessionCode?: string; // Optionnel
}
```

**Destinataire** : Tous les clients de la session

---

### `operatorBackNavigation`
**Émis quand** : Un retour en arrière est détecté ou signalé par un opérateur

**Payload** :
```typescript
{
  sessionCode: string;
  operatorId: string;
  operatorLabel: string;
  timestamp: Date;
  autoDetected?: boolean; // true si détecté automatiquement
  path?: string;
  state?: string;
  action?: string;
  data?: Record<string, unknown>;
}
```

**Destinataire** : Agent uniquement

---

### `operatorActionsHistory`
**Émis quand** : L'agent demande l'historique des actions

**Payload** :
```typescript
{
  sessionCode: string;
  operatorId?: string;
  actions: OperatorAction[];
}
```

**Destinataire** : Agent qui a appelé `getOperatorActions`

---

### `operatorBackNavigationDetected`
**Émis quand** : Un retour en arrière est détecté (pour debug)

**Payload** :
```typescript
{
  sessionCode: string;
  operatorId: string;
  operatorLabel: string;
  timestamp: Date;
}
```

**Destinataire** : Tous les clients de la session (debug uniquement)

---

### `error`
**Émis quand** : Une erreur survient

**Payload** :
```typescript
{
  message: string;
}
```

**Destinataire** : Client concerné

---

## Flux de jeu typique

### 1. Création de session (Agent)

```typescript
// 1. Agent se connecte
const socket = io('http://localhost:3000');

// 2. Agent crée une session
socket.emit('createSession', {
  difficulty: 'Medium',
  role: 'agent'
});

// 3. Agent reçoit le code de session
socket.on('sessionCreated', (session) => {
  const sessionCode = session.code; // Ex: "A1B2C3"
  // Afficher le code à l'agent pour qu'il le partage
});
```

### 2. Rejoindre une session (Opérateur)

```typescript
// 1. Opérateur se connecte
const socket = io('http://localhost:3000');

// 2. Opérateur rejoint avec le code partagé
socket.emit('joinSession', {
  sessionCode: 'A1B2C3',
  player: 'John Doe'
});

// 3. Opérateur reçoit confirmation
socket.on('playerJoined', (data) => {
  console.log('Vous êtes:', data.playerLabel); // "operator 1"
  console.log('Rôle:', data.playerRole); // "operator"
  // data = { playerId, playerLabel, playerRole, session }
});
```

### 3. Démarrage du jeu (Agent)

```typescript
// 1. Agent démarre le jeu (après que des opérateurs aient rejoint)
socket.emit('startGame', {
  sessionCode: 'A1B2C3'
});

// 2. Tous les clients reçoivent les modules
socket.on('gameStarted', (data) => {
  // Agent voit tous les modules (sans solutions)
  console.log('Modules:', data.moduleManuals);
  
  // Opérateurs voient leurs solutions assignées
  const mySolutions = data.solutionsByOperator[socket.id];
  console.log('Mes solutions:', mySolutions);
});
```

### 4. Démarrage du timer (Agent)

```typescript
// Agent démarre le timer
socket.emit('startTimer', {
  sessionCode: 'A1B2C3'
});

// Tous les clients reçoivent les mises à jour
socket.on('timerUpdate', (data) => {
  const minutes = Math.floor(data.remaining / 60);
  const seconds = data.remaining % 60;
  console.log(`Temps restant: ${minutes}:${seconds}`);
});

// Quand le temps est écoulé
socket.on('gameOver', (data) => {
  console.log('Fin du jeu:', data.message);
});
```

### 5. Suivi des actions (Opérateur)

```typescript
// Opérateur enregistre ses actions
socket.emit('operatorAction', {
  sessionCode: 'A1B2C3',
  action: 'navigate',
  data: {
    path: '/module/1',
    moduleId: 'module-id-1'
  }
});

// Si retour en arrière détecté, l'agent est notifié automatiquement
```

### 6. Consultation de l'historique (Agent)

```typescript
// Agent consulte l'historique d'un opérateur
socket.emit('getOperatorActions', {
  sessionCode: 'A1B2C3',
  operatorId: 'socket-id-operator-1'
});

socket.on('operatorActionsHistory', (data) => {
  console.log('Actions de l\'opérateur:', data.actions);
});
```

### 7. Fin de session

```typescript
// Option 1: Agent supprime la session
socket.emit('clearSession', {
  sessionCode: 'A1B2C3'
});

// Option 2: Agent arrête le timer
socket.emit('stopTimer', {
  sessionCode: 'A1B2C3'
});

// Option 3: Timer atteint 0 (automatique)
socket.on('gameOver', (data) => {
  console.log('Jeu terminé:', data.message);
});
```

---

## Gestion des déconnexions

### Déconnexion de l'agent
- La session est automatiquement fermée
- Tous les opérateurs reçoivent `gameOver` avec le message "L'agent a quitté la session"
- Le timer est arrêté
- La session est supprimée de Redis

### Déconnexion d'un opérateur
- L'opérateur est retiré de la session
- Si c'est le dernier opérateur, la session est fermée
- Les autres clients reçoivent `playerLeft`
- Si la session est fermée, tous reçoivent `gameOver`

### Gestion automatique
Le système gère automatiquement les déconnexions via `handleDisconnect` dans le gateway.

---

## Détection des retours en arrière

### Méthode automatique
Le système détecte automatiquement les retours en arrière en comparant :
1. Les actions de navigation (`navigate`, `getSession`)
2. Les chemins/états visités
3. L'historique des 20 dernières actions

### Méthode manuelle
Les opérateurs peuvent signaler explicitement un retour en arrière :
```typescript
socket.emit('back', {
  sessionCode: 'A1B2C3',
  path: '/module/1'
});
```

### Notification à l'agent
Quand un retour en arrière est détecté, l'agent reçoit :
```typescript
socket.on('operatorBackNavigation', (data) => {
  console.log(`${data.operatorLabel} a fait un retour en arrière`);
  // Afficher une notification à l'agent
});
```

---

## Structure des données

### Session
```typescript
interface Session {
  id: string; // UUID
  code: string; // 6 caractères alphanumériques majuscules
  agentId: string; // socket.id de l'agent
  maxTime: number; // Durée maximale en secondes
  remainingTime: number; // Temps restant en secondes
  timerStarted: boolean; // État du timer
  createdAt: Date; // Date de création
  players: Player[]; // Liste des joueurs
  started: boolean; // Jeu démarré ou non
  operatorActions?: OperatorAction[]; // Historique des actions
}
```

### Player
```typescript
type Player = {
  id: string; // socket.id
  role: 'agent' | 'operator';
  label: string; // "agent", "operator 1", "operator 2", etc.
};
```

### OperatorAction
```typescript
type OperatorAction = {
  operatorId: string; // socket.id de l'opérateur
  action: string; // Type d'action
  timestamp: Date;
  data?: Record<string, unknown>; // Données supplémentaires
};
```

### Module
```typescript
interface ModuleEntity {
  _id: string; // MongoDB ObjectId
  name: string; // Unique
  description: string;
  rules: string;
  imgUrl?: string;
  solutions: string[]; // Étapes de résolution
}
```

### SolutionsDistribution
```typescript
type SolutionsDistribution = {
  moduleId: string;
  allocations: Record<string, string[]>; // { operatorId: solutions[] }
};
```

### SolutionsByOperator
```typescript
type SolutionsByOperator = Record<
  string, // operatorId
  Array<{
    moduleId: string;
    solutions: string[];
  }>
>;
```

---

## Bonnes pratiques frontend

### Gestion de la connexion
```typescript
// Toujours gérer la déconnexion
socket.on('disconnect', () => {
  console.log('Déconnecté du serveur');
  // Réafficher l'écran de connexion
});

socket.on('connect', () => {
  console.log('Connecté');
  // Rejoindre la session si nécessaire
});
```

### Gestion des erreurs
```typescript
socket.on('error', (error) => {
  console.error('Erreur:', error.message);
  // Afficher un message d'erreur à l'utilisateur
});
```

### Réinitialisation d'état
```typescript
// Quand la session est supprimée
socket.on('sessionCleared', () => {
  // Réinitialiser l'état de l'application
  // Retourner à l'écran d'accueil
});

// Quand le jeu se termine
socket.on('gameOver', (data) => {
  // Afficher l'écran de fin de jeu
  // Désactiver les interactions
});
```

### Affichage du timer
```typescript
// Formater le temps restant
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

socket.on('timerUpdate', (data) => {
  const formatted = formatTime(data.remaining);
  // Mettre à jour l'affichage
});
```

---

## Points d'attention

### Sécurité
- ⚠️ CORS actuellement ouvert à toutes les origines
- ⚠️ Pas d'authentification (ni REST ni WebSocket)
- ⚠️ Pas de validation des rôles côté client (seulement côté serveur)

### Performance
- ⚠️ Pas de TTL Redis sur les sessions (risque d'accumulation)
- ⚠️ Historique des actions limité à 100 par session
- ⚠️ Timer en mémoire (perdu au redémarrage du serveur)

### Limitations
- Un seul timer par session
- Un seul agent par session
- Pas de reprise de timer après redémarrage serveur
- Pas de système de pause/reprise du timer

---

## Pistes d'amélioration

### Court terme
1. Ajouter une TTL Redis pour auto-nettoyer les sessions inactives
2. Implémenter un système de pause/reprise du timer
3. Ajouter une validation plus stricte des payloads WebSocket
4. Documenter les schémas TypeScript pour le frontend

### Moyen terme
1. Ajouter l'authentification (JWT pour WebSocket)
2. Restreindre CORS à des origines spécifiques
3. Ajouter un système de sauvegarde/restauration de sessions
4. Implémenter un système de statistiques de jeu

### Long terme
1. Multi-sessions simultanées pour un même agent
2. Système de classement/score
3. Mode spectateur
4. Replay des sessions

---

## Exemples complets

### Agent - Application complète
```typescript
import { io, Socket } from 'socket.io-client';

class AgentApp {
  private socket: Socket;
  private sessionCode: string | null = null;

  constructor() {
    this.socket = io('http://localhost:3000');
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connecté en tant qu\'agent');
    });

    this.socket.on('sessionCreated', (session) => {
      this.sessionCode = session.code;
      console.log('Session créée:', this.sessionCode);
      // Afficher le code à partager
    });

    this.socket.on('playerJoined', (data) => {
      console.log(`${data.playerLabel} (${data.playerRole}) a rejoint`);
      // Mettre à jour la liste des joueurs
      // data = { playerId, playerLabel, playerRole, session }
    });

    this.socket.on('playerLeft', (data) => {
      console.log('Joueur parti:', data.playerId);
      // Mettre à jour la liste des joueurs
    });

    this.socket.on('gameStarted', (data) => {
      console.log('Jeu démarré avec', data.moduleManuals.length, 'modules');
      // Afficher les modules
    });

    this.socket.on('timerUpdate', (data) => {
      // Mettre à jour l'affichage du timer
      this.updateTimer(data.remaining);
    });

    this.socket.on('gameOver', (data) => {
      console.log('Jeu terminé:', data.message);
      // Afficher l'écran de fin
    });

    this.socket.on('operatorBackNavigation', (data) => {
      console.log(`⚠️ ${data.operatorLabel} a fait un retour en arrière`);
      // Afficher une notification
    });

    this.socket.on('error', (error) => {
      console.error('Erreur:', error.message);
    });
  }

  createSession(difficulty: 'Easy' | 'Medium' | 'Hard') {
    this.socket.emit('createSession', {
      difficulty,
      role: 'agent'
    });
  }

  startGame() {
    if (!this.sessionCode) return;
    this.socket.emit('startGame', {
      sessionCode: this.sessionCode
    });
  }

  startTimer() {
    if (!this.sessionCode) return;
    this.socket.emit('startTimer', {
      sessionCode: this.sessionCode
    });
  }

  stopTimer() {
    if (!this.sessionCode) return;
    this.socket.emit('stopTimer', {
      sessionCode: this.sessionCode
    });
  }

  clearSession() {
    if (!this.sessionCode) return;
    this.socket.emit('clearSession', {
      sessionCode: this.sessionCode
    });
    this.sessionCode = null;
  }

  private updateTimer(remaining: number) {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    console.log(`Timer: ${mins}:${secs.toString().padStart(2, '0')}`);
  }
}
```

### Opérateur - Application complète
```typescript
import { io, Socket } from 'socket.io-client';

class OperatorApp {
  private socket: Socket;
  private sessionCode: string | null = null;
  private mySolutions: SolutionsByOperator[string] = [];

  constructor() {
    this.socket = io('http://localhost:3000');
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connecté en tant qu\'opérateur');
    });

    this.socket.on('playerJoined', (data) => {
      if (data.playerId === this.socket.id) {
        console.log('Vous avez rejoint la session');
        console.log('Rôle:', data.playerRole);
      }
      // data = { playerId, playerLabel, playerRole, session }
    });

    this.socket.on('gameStarted', (data) => {
      // Récupérer mes solutions assignées
      this.mySolutions = data.solutionsByOperator[this.socket.id] || [];
      console.log('Mes solutions:', this.mySolutions);
      
      // Afficher les modules (sans solutions)
      console.log('Modules disponibles:', data.moduleManuals);
    });

    this.socket.on('timerUpdate', (data) => {
      this.updateTimer(data.remaining);
    });

    this.socket.on('gameOver', (data) => {
      console.log('Jeu terminé:', data.message);
    });

    this.socket.on('error', (error) => {
      console.error('Erreur:', error.message);
    });
  }

  joinSession(sessionCode: string, playerName: string) {
    this.sessionCode = sessionCode;
    this.socket.emit('joinSession', {
      sessionCode,
      player: playerName
    });
  }

  recordAction(action: string, data?: Record<string, unknown>) {
    if (!this.sessionCode) return;
    this.socket.emit('operatorAction', {
      sessionCode: this.sessionCode,
      action,
      data
    });
  }

  reportBackNavigation(path?: string) {
    if (!this.sessionCode) return;
    this.socket.emit('back', {
      sessionCode: this.sessionCode,
      path
    });
  }

  private updateTimer(remaining: number) {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    console.log(`Temps restant: ${mins}:${secs.toString().padStart(2, '0')}`);
  }
}
```

---

## Conclusion

Ce guide couvre l'ensemble des fonctionnalités de l'API Leaving Box. Pour toute question ou amélioration, référez-vous aux fichiers source dans `src/` et aux autres documents dans `docs/`.

**Points clés à retenir** :
- Les WebSockets sont le cœur de la communication temps réel
- L'agent a le contrôle total sur la session
- Les opérateurs reçoivent des solutions réparties automatiquement
- Le système détecte automatiquement les retours en arrière
- Les déconnexions sont gérées automatiquement

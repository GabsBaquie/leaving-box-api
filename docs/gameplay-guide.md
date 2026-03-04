# Guide Gameplay Leaving Box

## Vue d'ensemble

API NestJS + WebSockets (Socket.IO). Un **agent** crée une session, des **analystes** rejoignent pour résoudre des modules dans un temps limité.

- **Sessions** : Redis (`session:{code}`)
- **Modules** : MongoDB
- **Swagger** : `/api`

---

## Rôles

| Rôle | Permissions | Label |
|------|-------------|-------|
| **agent** | createSession, startGame, startTimer, stopTimer, clearSession | `"agent"` |
| **analyste** | joinSession, leaveSession, operatorAction | `"analyste 1"`, `"analyste 2"`... |

---

## WebSockets — Événements principaux

### Client → Serveur

| Événement | Payload | Qui |
|-----------|---------|-----|
| `createSession` | `{ difficulty, gameMode?, role }` | agent |
| `joinSession` | `{ sessionCode, player }` | analyste |
| `leaveSession` | `{ sessionCode, player }` | tous |
| `getSession` | `{ sessionCode, currentPath? }` | tous |
| `startGame` | `{ sessionCode }` | agent |
| `startTimer` | `{ sessionCode }` | agent |
| `stopTimer` | `{ sessionCode }` | agent |
| `clearSession` | `{ sessionCode }` | agent |
| `operatorAction` | `{ sessionCode, action, data? }` | analyste |
| `back` / `operatorBackNavigation` | `{ sessionCode, path?, state? }` | analyste |
| `getOperatorActions` | `{ sessionCode, operatorId? }` | agent |

### Serveur → Client

| Événement | Quand |
|-----------|-------|
| `sessionCreated` | Session créée |
| `playerJoined` | Analyste rejoint |
| `playerLeft` | Joueur quitte |
| `currentSession` | Après getSession |
| `gameStarted` | Jeu démarré (modules + solutions) |
| `timerUpdate` | Chaque seconde |
| `timerStopped` | Timer arrêté |
| `gameOver` | Temps écoulé ou session fermée |
| `operatorBackNavigation` | Retour arrière détecté |
| `operatorActionsHistory` | Après getOperatorActions |
| `error` | Erreur |

---

## Types

```typescript
type GameDifficulty = 'Easy' | 'Medium' | 'Hard';
type GameMode = 'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT';
type PlayerRole = 'agent' | 'analyste';

type Player = { id: string; role: PlayerRole; label: string };

type SolutionWithIndex = { index: number; text: string };

type SolutionsByAnalyste = Record<
  string,
  Array<{ moduleId: string; solutions: SolutionWithIndex[] }>
>;
```

---

## Flux typique

```typescript
// 1. Agent crée
socket.emit('createSession', { difficulty: 'Medium', role: 'agent' });
socket.on('sessionCreated', (s) => console.log('Code:', s.code));

// 2. Analyste rejoint
socket.emit('joinSession', { sessionCode: 'ABC123', player: 'John' });
socket.on('playerJoined', (d) => console.log('Rôle:', d.playerRole));

// 3. Agent démarre
socket.emit('startGame', { sessionCode: 'ABC123' });
socket.on('gameStarted', (d) => {
  const mySolutions = d.solutionsByAnalyste[socket.id];
});

// 4. Agent lance le timer
socket.emit('startTimer', { sessionCode: 'ABC123' });
socket.on('timerUpdate', (d) => console.log('Restant:', d.remaining));
```

---

## Difficultés (temps max)

- **Easy** : 1200s (20 min)
- **Medium** : 900s (15 min)
- **Hard** : 600s (10 min)

---

## Modes de jeu

- **ONE_OPERATOR_ONE_MODULE** : 1 analyste = 1 module complet. Cas spécial 3 analystes : 3 modules + 1 partagé.
- **RANDOM_ONE_MODULE_SPLIT** : Solutions réparties en round-robin entre analystes.

---

## API REST

- `GET /sessions` — Liste des clés sessions
- `GET /sessions/:code` — Détail session
- `GET /module` — Liste modules
- `POST /module` — Créer module
- `GET /module/:id` — Détail module

---

## Détection retour arrière

- **Automatique** : via `operatorAction` ou `getSession` avec `currentPath`
- **Manuel** : `socket.emit('back', { sessionCode })`

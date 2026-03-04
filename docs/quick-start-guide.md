# Guide Rapide - Modes de Jeu et Difficultés

## Vue d'ensemble

Le système de gameplay a été refactorisé pour gérer les difficultés et les modes de jeu de manière modulaire.

## Connexion WebSocket (React Native/Expo)

### Configuration recommandée

```typescript
import { io } from 'socket.io-client';
import { Platform } from 'react-native';

const getWebSocketUrl = () => {
  if (__DEV__) {
    // Android Emulator
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    // iOS Simulator
    if (Platform.OS === 'ios') {
      return 'http://localhost:3000';
    }
    // Appareil physique - utilisez votre IP locale
    return 'http://192.168.1.X:3000'; // Remplacez X par votre IP
  }
  return process.env.EXPO_PUBLIC_WEBSOCKET_URL || 'https://votre-serveur.com';
};

const socket = io(getWebSocketUrl(), {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
});

socket.on('connect', () => {
  console.log('✅ Connecté:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion:', error.message);
});
```

**Important** : Pour un appareil physique, utilisez l'IP locale de votre machine (pas `localhost`). Voir `docs/troubleshooting-websocket.md` pour plus de détails.

## Changements principaux

### 1. Nouveau paramètre `gameMode` lors de la création de session

Lors de la création d'une session, vous devez maintenant spécifier :
- `difficulty` : `'Easy' | 'Medium' | 'Hard'`
- `gameMode` : `'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT'` (optionnel, défaut: `'ONE_OPERATOR_ONE_MODULE'`)

### 2. Durées par difficulté

- **Easy** : 1200 secondes (20 minutes)
- **Medium** : 900 secondes (15 minutes)
- **Hard** : 600 secondes (10 minutes)

### 3. Modes de jeu

#### Mode 1 : `ONE_OPERATOR_ONE_MODULE` (par défaut)

**Sélection de modules** :
- Si 4 modules ou moins disponibles → Affiche tous les modules
- Si plus de 4 modules → Sélectionne 4 modules aléatoirement

**Distribution** :
- **2 opérateurs** : 2 modules chacun (Module 1-2 → Op1, Module 3-4 → Op2)
- **3 opérateurs** : 3 modules individuels + 1 module partagé (Module 1→Op1, Module 2→Op2, Module 3→Op3, Module 4→tous)
- **4+ opérateurs** : Round-robin sur les modules

#### Mode 2 : `RANDOM_ONE_MODULE_SPLIT`

**Sélection de modules** : Même logique que le mode 1

**Distribution** : Les solutions de chaque module sont réparties en round-robin entre tous les opérateurs

---

## Fonctions à appeler

### 1. Créer une session (Agent)

```typescript
socket.emit('createSession', {
  difficulty: 'Medium', // 'Easy' | 'Medium' | 'Hard'
  gameMode: 'ONE_OPERATOR_ONE_MODULE', // Optionnel, défaut: 'ONE_OPERATOR_ONE_MODULE'
  role: 'agent' // OBLIGATOIRE - doit être 'agent' pour créer une session
});

// Écouter la réponse
socket.on('sessionCreated', (session) => {
  console.log('Session créée:', session.code);
  console.log('Difficulté:', session.difficulty);
  console.log('Mode de jeu:', session.gameMode);
  // session = { id, code, agentId, maxTime, remainingTime, difficulty, gameMode, ... }
});
```

### 2. Rejoindre une session (Opérateur)

```typescript
socket.emit('joinSession', {
  sessionCode: 'A1B2C3',
  player: 'John Doe'
});

socket.on('playerJoined', (data) => {
  console.log('Vous êtes:', data.playerLabel); // "operator 1", "operator 2", etc.
  console.log('Rôle:', data.playerRole); // "operator" ou "agent"
  // data = { playerId, playerLabel, playerRole, session }
});
```

### 3. Démarrer le jeu (Agent)

```typescript
socket.emit('startGame', {
  sessionCode: 'A1B2C3'
});

socket.on('gameStarted', (data) => {
  // Tous les modules (sans solutions) - visibles par tous
  console.log('Modules:', data.moduleManuals);
  
  // Solutions assignées à cet opérateur
  const mySolutions = data.solutionsByOperator[socket.id];
  console.log('Mes solutions:', mySolutions);
  
  // Structure de mySolutions :
  // [
  //   { moduleId: "module-id-1", solutions: ["Étape 1", "Étape 2"] },
  //   { moduleId: "module-id-2", solutions: ["Étape 3"] }
  // ]
});
```

### 4. Démarrer le timer (Agent)

```typescript
socket.emit('startTimer', {
  sessionCode: 'A1B2C3'
});

socket.on('timerUpdate', (data) => {
  console.log('Temps restant:', data.remaining, 'secondes');
});
```

---

## Exemples complets

### Exemple 1 : Session Easy avec mode par défaut

```typescript
// Agent crée une session
socket.emit('createSession', {
  difficulty: 'Easy',
  gameMode: 'ONE_OPERATOR_ONE_MODULE', // Optionnel
  role: 'agent' // OBLIGATOIRE
});

socket.on('sessionCreated', async (session) => {
  const sessionCode = session.code; // Ex: "A1B2C3"
  
  // Attendre que des opérateurs rejoignent...
  
  // Démarrer le jeu
  socket.emit('startGame', { sessionCode });
});

socket.on('gameStarted', (data) => {
  // Avec 2 opérateurs et 4 modules :
  // - Opérateur 1 reçoit : Module 1 (toutes solutions) + Module 2 (toutes solutions)
  // - Opérateur 2 reçoit : Module 3 (toutes solutions) + Module 4 (toutes solutions)
});
```

### Exemple 2 : Session Hard avec mode split

```typescript
// Agent crée une session
socket.emit('createSession', {
  difficulty: 'Hard',
  gameMode: 'RANDOM_ONE_MODULE_SPLIT',
  role: 'agent' // OBLIGATOIRE
});

socket.on('gameStarted', (data) => {
  // Avec 3 opérateurs et 4 modules :
  // - Tous les opérateurs voient les 4 modules
  // - Les solutions de chaque module sont réparties en round-robin
  //   Exemple Module A (9 solutions) :
  //     - Opérateur 1 : Solutions 1, 4, 7
  //     - Opérateur 2 : Solutions 2, 5, 8
  //     - Opérateur 3 : Solutions 3, 6, 9
});
```

### Exemple 3 : Session avec 3 opérateurs (mode par défaut)

```typescript
socket.emit('createSession', {
  difficulty: 'Medium',
  gameMode: 'ONE_OPERATOR_ONE_MODULE',
  role: 'agent' // OBLIGATOIRE
});

socket.on('gameStarted', (data) => {
  // Distribution avec 3 opérateurs :
  // - Opérateur 1 : Module 1 (toutes les solutions)
  // - Opérateur 2 : Module 2 (toutes les solutions)
  // - Opérateur 3 : Module 3 (toutes les solutions)
  // - Tous : Module 4 (toutes les solutions à chacun)
});
```

---

## Structure des données

### Session

```typescript
interface Session {
  id: string;
  code: string;
  agentId: string;
  maxTime: number; // Selon la difficulté
  remainingTime: number;
  timerStarted: boolean;
  createdAt: Date;
  players: Player[];
  started: boolean;
  operatorActions?: OperatorAction[];
  difficulty: 'Easy' | 'Medium' | 'Hard'; // NOUVEAU
  gameMode: 'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT'; // NOUVEAU
}
```

### Réponse `gameStarted`

```typescript
{
  session: Session;
  moduleManuals: Module[]; // Modules sans solutions (visibles par tous)
  solutionsDistribution: SolutionsDistribution[];
  solutionsByOperator: {
    [operatorId: string]: Array<{
      moduleId: string;
      solutions: string[];
    }>;
  };
}
```

---

## Migration depuis l'ancien système

### Ancien code

```typescript
// ❌ Ancien code
socket.emit('createSession', {
  difficulty: 'Medium'
});
```

### Nouveau code

```typescript
// ✅ Nouveau code
socket.emit('createSession', {
  difficulty: 'Medium',
  gameMode: 'ONE_OPERATOR_ONE_MODULE', // Optionnel, valeur par défaut
  role: 'agent' // OBLIGATOIRE
});
```

**Note** : Les sessions existantes sont automatiquement migrées avec `gameMode: 'ONE_OPERATOR_ONE_MODULE'` par défaut.

---

## Points importants

1. **Sélection de modules** :
   - Si vous avez exactement 4 modules → tous sont affichés
   - Si vous avez plus de 4 modules → 4 sont sélectionnés aléatoirement

2. **Mode `ONE_OPERATOR_ONE_MODULE` avec 3 opérateurs** :
   - Les 3 premiers modules sont assignés individuellement
   - Le 4ème module est partagé (toutes les solutions à tous)

3. **Mode `RANDOM_ONE_MODULE_SPLIT`** :
   - Même sélection de modules que le mode 1
   - Mais les solutions sont réparties en round-robin

4. **Compatibilité** :
   - Si `gameMode` n'est pas fourni → `ONE_OPERATOR_ONE_MODULE` par défaut
   - Les anciennes sessions sont automatiquement migrées

---

## API REST (inchangée)

Les endpoints REST restent identiques :

```typescript
// Créer un module
POST /module
{
  name: "Module Simon",
  description: "...",
  rules: "...",
  solutions: ["Étape 1", "Étape 2"],
  imgUrl: "..."
}

// Lister les modules
GET /module

// Récupérer une session
GET /sessions/:sessionCode
```

---

## Résumé des événements WebSocket

### Client → Serveur

| Événement | Paramètres | Description |
|-----------|------------|-------------|
| `createSession` | `{ difficulty, gameMode?, role }` | Crée une session (Agent) - `role` obligatoire |
| `joinSession` | `{ sessionCode, player }` | Rejoint une session (Opérateur) |
| `startGame` | `{ sessionCode }` | Démarre le jeu (Agent) |
| `startTimer` | `{ sessionCode }` | Démarre le timer (Agent) |
| `stopTimer` | `{ sessionCode }` | Arrête le timer (Agent) |
| `clearSession` | `{ sessionCode }` | Supprime la session (Agent) |

### Serveur → Client

| Événement | Données | Description |
|-----------|---------|-------------|
| `sessionCreated` | `Session` | Session créée |
| `playerJoined` | `{ playerId, playerLabel, playerRole, session }` | Joueur rejoint - `playerRole` obligatoire |
| `gameStarted` | `{ session, moduleManuals, solutionsDistribution, solutionsByOperator }` | Jeu démarré |
| `timerUpdate` | `{ remaining }` | Mise à jour du timer |
| `gameOver` | `{ message }` | Fin du jeu |

---

## Fichiers de configuration

- **Difficultés** : `src/session/gameplay/config/difficulty.config.ts`
- **Types** : `src/session/gameplay/types/gameplay.types.ts`
- **Stratégies** : `src/session/gameplay/strategies/`

Pour modifier les durées ou ajouter des modes, consultez ces fichiers.

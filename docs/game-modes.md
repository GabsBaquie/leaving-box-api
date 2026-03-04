# Modes de Jeu et Difficultés

## Vue d'ensemble

Le système de gameplay a été découplé en plusieurs composants modulaires pour gérer les difficultés et les modes de jeu de manière flexible.

## Difficultés

Les difficultés déterminent le temps maximum alloué à une session :

- **Easy** : 1200 secondes (20 minutes)
- **Medium** : 900 secondes (15 minutes)
- **Hard** : 600 secondes (10 minutes)

La configuration est centralisée dans `src/session/gameplay/config/difficulty.config.ts`.

## Modes de Jeu

### 1. ONE_OPERATOR_ONE_MODULE (Par défaut)

**Description** : Affiche tous les modules disponibles (si 4 ou moins) ou sélectionne 4 modules aléatoirement, puis les répartit selon le nombre d'opérateurs.

**Comportement** :
- **Si 4 modules ou moins disponibles** : Affiche tous les modules (pas de sélection aléatoire)
- **Si plus de 4 modules** : Sélectionne 4 modules aléatoirement
- **2 opérateurs** : 2 modules chacun (2x2)
- **3 opérateurs** : 2 modules individuels + 1 module partagé (solutions réparties pareillement entre les 3 opérateurs)
- **4+ opérateurs** : Round-robin sur les modules disponibles

**Exemples** :

**2 opérateurs** :
- Module 1 → Opérateur 1 (toutes les solutions)
- Module 2 → Opérateur 1 (toutes les solutions)
- Module 3 → Opérateur 2 (toutes les solutions)
- Module 4 → Opérateur 2 (toutes les solutions)

**3 opérateurs** :
- Module 1 → Opérateur 1 (toutes les solutions)
- Module 2 → Opérateur 2 (toutes les solutions)
- Module 3 → Opérateur 3 (toutes les solutions)
- Module 4 → Partagé entre tous (solutions partagées pareillement entre les 3 opérateurs)
  - Opérateur 1 : Solutions toutes
  - Opérateur 2 : Solutions toutes
  - Opérateur 3 : Solutions toutes

### 2. RANDOM_ONE_MODULE_SPLIT

**Description** : Tous les modules sont sélectionnés de manière aléatoire, mais leurs solutions sont réparties en round-robin entre tous les opérateurs.

**Comportement** :
- Les solutions de chaque module sont réparties en round-robin entre les opérateurs
- Chaque opérateur reçoit une partie des solutions de chaque module
- Sélection de module comme pour le mode 1

**Exemple** :
- 3 opérateurs → tous les modules sélectionnés, solutions réparties en round-robin entre les 3 opérateurs

## Architecture

### Structure des fichiers

```
src/session/gameplay/
├── types/
│   └── gameplay.types.ts          # Types TypeScript (GameDifficulty, GameMode, etc.)
├── config/
│   └── difficulty.config.ts       # Configuration des difficultés
├── strategies/
│   ├── module-selection.strategy.ts      # Stratégies de sélection de modules
│   └── solution-distribution.strategy.ts # Stratégies de distribution de solutions
└── gameplay.service.ts           # Service principal qui orchestre tout
```

### Pattern Strategy

Le système utilise le pattern Strategy pour permettre l'ajout facile de nouveaux modes de jeu :

1. **ModuleSelectionStrategy** : Détermine quels modules sont sélectionnés
2. **SolutionDistributionStrategy** : Détermine comment les solutions sont réparties

Pour ajouter un nouveau mode :
1. Créer une nouvelle classe qui implémente `ModuleSelectionStrategy`
2. Créer une nouvelle classe qui implémente `SolutionDistributionStrategy`
3. Ajouter le nouveau mode dans `gameplay.types.ts`
4. Mettre à jour les factories dans les fichiers de stratégies

## Utilisation

### Création d'une session

```typescript
socket.emit('createSession', {
  difficulty: 'Medium',
  gameMode: 'ONE_OPERATOR_ONE_MODULE', // ou 'RANDOM_ONE_MODULE_SPLIT'
  role: 'agent'
});
```

### Valeurs par défaut

- Si `gameMode` n'est pas fourni lors de la création : `ONE_OPERATOR_ONE_MODULE`
- Pour les anciennes sessions sans `gameMode` : migration automatique vers `ONE_OPERATOR_ONE_MODULE`

## Migration

Les sessions existantes sont automatiquement migrées :
- Si `difficulty` manque → `Medium`
- Si `gameMode` manque → `ONE_OPERATOR_ONE_MODULE`

La migration se fait lors de la lecture de la session (`getSession`).

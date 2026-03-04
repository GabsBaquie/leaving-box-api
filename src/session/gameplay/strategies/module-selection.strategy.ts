import { ModuleEntity } from 'src/game/modules/module.schema';
import { GameMode } from '../types/gameplay.types';

export interface ModuleSelectionStrategy {
  selectModules(availableModules: ModuleEntity[]): ModuleEntity[];
}

/**
 * Stratégie : 1 opérateur = 1 module complet
 * Si 4 modules ou moins disponibles : affiche tous les modules
 * Si plus de 4 modules : sélectionne 4 modules aléatoirement
 * Distribution spéciale selon le nombre d'opérateurs :
 * - 2 opérateurs : 2 modules chacun (2x2)
 * - 3 opérateurs : 2 modules individuels + 1 module partagé
 * - 4+ opérateurs : round-robin sur les modules
 */
export class OneOperatorOneModuleStrategy implements ModuleSelectionStrategy {
  selectModules(availableModules: ModuleEntity[]): ModuleEntity[] {
    // Si 4 modules ou moins, retourner tous les modules
    if (availableModules.length <= 4) {
      return [...availableModules];
    }

    // Si plus de 4 modules, sélectionner 4 modules aléatoirement
    const selectedModules: ModuleEntity[] = [];
    const shuffled = [...availableModules].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 4; i++) {
      selectedModules.push(shuffled[i]);
    }

    return selectedModules;
  }
}

/**
 * Stratégie : Modules aléatoires, solutions réparties
 * Même logique de sélection que ONE_OPERATOR_ONE_MODULE :
 * - Si 4 modules ou moins disponibles : affiche tous les modules
 * - Si plus de 4 modules : sélectionne 4 modules aléatoirement
 * Les solutions sont ensuite réparties en round-robin entre tous les opérateurs
 */
export class RandomOneModuleSplitStrategy implements ModuleSelectionStrategy {
  selectModules(availableModules: ModuleEntity[]): ModuleEntity[] {
    // Si 4 modules ou moins, retourner tous les modules
    if (availableModules.length <= 4) {
      return [...availableModules];
    }

    // Si plus de 4 modules, sélectionner 4 modules aléatoirement
    const selectedModules: ModuleEntity[] = [];
    const shuffled = [...availableModules].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 4; i++) {
      selectedModules.push(shuffled[i]);
    }

    return selectedModules;
  }
}

export const createModuleSelectionStrategy = (
  gameMode: GameMode,
): ModuleSelectionStrategy => {
  switch (gameMode) {
    case 'ONE_OPERATOR_ONE_MODULE':
      return new OneOperatorOneModuleStrategy();
    case 'RANDOM_ONE_MODULE_SPLIT':
      return new RandomOneModuleSplitStrategy();
    default:
      throw new Error(`Mode de jeu non supporté: ${String(gameMode)}`);
  }
};

import { ModuleEntity } from 'src/game/modules/module.schema';
import {
  SolutionsDistribution,
  SolutionsByOperator,
} from 'src/session/utils/solutions-distribution';
import { GameMode } from '../types/gameplay.types';

export interface SolutionDistributionStrategy {
  distribute(
    modules: ModuleEntity[],
    recipientIds: string[],
  ): {
    solutionsDistribution: SolutionsDistribution[];
    solutionsByOperator: SolutionsByOperator;
  };
}

/**
 * Stratégie : 1 opérateur = 1 module complet
 * 4 modules par défaut avec distribution spéciale :
 * - 2 opérateurs : 2 modules chacun (2x2)
 * - 3 opérateurs : 3 modules individuels + 1 module partagé (toutes les solutions à tous)
 * - 4+ opérateurs : round-robin sur les modules
 */
export class OneOperatorOneModuleDistributionStrategy
  implements SolutionDistributionStrategy
{
  distribute(
    modules: ModuleEntity[],
    recipientIds: string[],
  ): {
    solutionsDistribution: SolutionsDistribution[];
    solutionsByOperator: SolutionsByOperator;
  } {
    const solutionsDistribution: SolutionsDistribution[] = [];
    const solutionsByOperator: SolutionsByOperator = {};

    // Initialiser les allocations pour chaque opérateur
    recipientIds.forEach((id) => {
      solutionsByOperator[id] = [];
    });

    if (modules.length === 0) {
      return { solutionsDistribution, solutionsByOperator };
    }

    const operatorCount = recipientIds.length;

    // Cas spécial : 3 opérateurs
    // 3 modules individuels (Op1, Op2, Op3) + 1 module partagé (toutes les solutions à tous)
    if (operatorCount === 3 && modules.length >= 3) {
      // Module 1 → Opérateur 1 (toutes les solutions)
      this.assignModuleToOperator(
        modules[0],
        recipientIds[0],
        solutionsDistribution,
        solutionsByOperator,
      );

      // Module 2 → Opérateur 2 (toutes les solutions)
      this.assignModuleToOperator(
        modules[1],
        recipientIds[1],
        solutionsDistribution,
        solutionsByOperator,
      );

      // Module 3 → Opérateur 3 (toutes les solutions)
      this.assignModuleToOperator(
        modules[2],
        recipientIds[2],
        solutionsDistribution,
        solutionsByOperator,
      );

      // Module 4 (si présent) → Partagé entre tous (toutes les solutions à tous)
      if (modules.length >= 4) {
        this.distributeModuleToAll(
          modules[3],
          recipientIds,
          solutionsDistribution,
          solutionsByOperator,
        );
      }

      return { solutionsDistribution, solutionsByOperator };
    }

    // Cas général : round-robin sur tous les modules
    modules.forEach((module, moduleIndex) => {
      const operatorIndex = moduleIndex % recipientIds.length;
      const operatorId = recipientIds[operatorIndex];
      this.assignModuleToOperator(
        module,
        operatorId,
        solutionsDistribution,
        solutionsByOperator,
      );
    });

    return { solutionsDistribution, solutionsByOperator };
  }

  private assignModuleToOperator(
    module: ModuleEntity,
    operatorId: string,
    solutionsDistribution: SolutionsDistribution[],
    solutionsByOperator: SolutionsByOperator,
  ): void {
    const moduleId = this.getModuleId(module);
    const allSolutions = module.solutions ?? [];

    solutionsDistribution.push({
      moduleId,
      allocations: {
        [operatorId]: allSolutions,
      },
    });

    if (!solutionsByOperator[operatorId]) {
      solutionsByOperator[operatorId] = [];
    }
    solutionsByOperator[operatorId].push({
      moduleId,
      solutions: allSolutions,
    });
  }

  private distributeModuleRoundRobin(
    module: ModuleEntity,
    recipientIds: string[],
    solutionsDistribution: SolutionsDistribution[],
    solutionsByOperator: SolutionsByOperator,
  ): void {
    const moduleId = this.getModuleId(module);
    const steps = module.solutions ?? [];
    const allocations: Record<string, string[]> = {};

    // Initialiser les allocations vides
    recipientIds.forEach((id) => {
      allocations[id] = [];
    });

    // Répartir les solutions en round-robin
    if (steps.length > 0 && recipientIds.length > 0) {
      steps.forEach((step, idx) => {
        const target = recipientIds[idx % recipientIds.length];
        allocations[target].push(step);
      });
    }

    solutionsDistribution.push({
      moduleId,
      allocations,
    });

    // Construire le mapping par opérateur
    Object.entries(allocations).forEach(([operatorId, solutions]) => {
      if (!solutionsByOperator[operatorId]) {
        solutionsByOperator[operatorId] = [];
      }
      if (solutions.length > 0) {
        solutionsByOperator[operatorId].push({
          moduleId,
          solutions,
        });
      }
    });
  }

  /**
   * Distribue un module à tous les opérateurs (toutes les solutions à chacun)
   */
  private distributeModuleToAll(
    module: ModuleEntity,
    recipientIds: string[],
    solutionsDistribution: SolutionsDistribution[],
    solutionsByOperator: SolutionsByOperator,
  ): void {
    const moduleId = this.getModuleId(module);
    const allSolutions = module.solutions ?? [];
    const allocations: Record<string, string[]> = {};

    // Chaque opérateur reçoit toutes les solutions
    recipientIds.forEach((id) => {
      allocations[id] = [...allSolutions];
    });

    solutionsDistribution.push({
      moduleId,
      allocations,
    });

    // Construire le mapping par opérateur
    recipientIds.forEach((operatorId) => {
      if (!solutionsByOperator[operatorId]) {
        solutionsByOperator[operatorId] = [];
      }
      if (allSolutions.length > 0) {
        solutionsByOperator[operatorId].push({
          moduleId,
          solutions: allSolutions,
        });
      }
    });
  }

  private getModuleId(module: ModuleEntity): string {
    const maybeDoc = module as ModuleEntity & {
      _id?: { toString: () => string };
    };
    if (maybeDoc._id && typeof maybeDoc._id.toString === 'function') {
      return maybeDoc._id.toString();
    }
    return module.name;
  }
}

/**
 * Stratégie : Modules aléatoires, solutions réparties
 * Les solutions de chaque module sont réparties en round-robin entre tous les opérateurs
 * Chaque opérateur reçoit une partie des solutions de chaque module
 */
export class RandomOneModuleSplitDistributionStrategy
  implements SolutionDistributionStrategy
{
  distribute(
    modules: ModuleEntity[],
    recipientIds: string[],
  ): {
    solutionsDistribution: SolutionsDistribution[];
    solutionsByOperator: SolutionsByOperator;
  } {
    const solutionsDistribution: SolutionsDistribution[] = [];
    const solutionsByOperator: SolutionsByOperator = {};

    // Initialiser les allocations pour chaque opérateur
    recipientIds.forEach((id) => {
      solutionsByOperator[id] = [];
    });

    if (modules.length === 0) {
      return { solutionsDistribution, solutionsByOperator };
    }

    // Pour chaque module, répartir ses solutions en round-robin entre tous les opérateurs
    modules.forEach((module) => {
      const moduleId = this.getModuleId(module);
      const steps = module.solutions ?? [];
      const allocations: Record<string, string[]> = {};

      // Initialiser les allocations vides pour ce module
      recipientIds.forEach((id) => {
        allocations[id] = [];
      });

      // Répartir les solutions de ce module en round-robin
      if (steps.length > 0 && recipientIds.length > 0) {
        steps.forEach((step, idx) => {
          const target = recipientIds[idx % recipientIds.length];
          allocations[target].push(step);
        });
      }

      solutionsDistribution.push({
        moduleId,
        allocations,
      });

      // Construire le mapping par opérateur pour ce module
      Object.entries(allocations).forEach(([operatorId, solutions]) => {
        if (!solutionsByOperator[operatorId]) {
          solutionsByOperator[operatorId] = [];
        }
        if (solutions.length > 0) {
          solutionsByOperator[operatorId].push({
            moduleId,
            solutions,
          });
        }
      });
    });

    return { solutionsDistribution, solutionsByOperator };
  }

  private getModuleId(module: ModuleEntity): string {
    const maybeDoc = module as ModuleEntity & {
      _id?: { toString: () => string };
    };
    if (maybeDoc._id && typeof maybeDoc._id.toString === 'function') {
      return maybeDoc._id.toString();
    }
    return module.name;
  }
}

export const createSolutionDistributionStrategy = (
  gameMode: GameMode,
): SolutionDistributionStrategy => {
  switch (gameMode) {
    case 'ONE_OPERATOR_ONE_MODULE':
      return new OneOperatorOneModuleDistributionStrategy();
    case 'RANDOM_ONE_MODULE_SPLIT':
      return new RandomOneModuleSplitDistributionStrategy();
    default:
      throw new Error(`Mode de jeu non supporté: ${gameMode as string}`);
  }
};

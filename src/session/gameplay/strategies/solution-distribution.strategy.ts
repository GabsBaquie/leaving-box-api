import { ModuleEntity } from 'src/game/modules/module.schema';
import {
  SolutionsDistribution,
  SolutionsByAnalyste,
  SolutionWithIndex,
} from 'src/session/utils/solutions-distribution';
import { GameMode } from '../types/gameplay.types';

export interface SolutionDistributionStrategy {
  distribute(
    modules: ModuleEntity[],
    recipientIds: string[],
  ): {
    solutionsDistribution: SolutionsDistribution[];
    solutionsByAnalyste: SolutionsByAnalyste;
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
    solutionsByAnalyste: SolutionsByAnalyste;
  } {
    const solutionsDistribution: SolutionsDistribution[] = [];
    const solutionsByAnalyste: SolutionsByAnalyste = {};

    // Initialiser les allocations pour chaque analyste
    recipientIds.forEach((id) => {
      solutionsByAnalyste[id] = [];
    });

    if (modules.length === 0) {
      return { solutionsDistribution, solutionsByAnalyste };
    }

    const analysteCount = recipientIds.length;

    // Cas spécial : 3 analystes
    // 3 modules individuels + 1 module partagé (toutes les solutions à tous)
    if (analysteCount === 3 && modules.length >= 3) {
      this.assignModuleToAnalyste(
        modules[0],
        recipientIds[0],
        solutionsDistribution,
        solutionsByAnalyste,
      );

      this.assignModuleToAnalyste(
        modules[1],
        recipientIds[1],
        solutionsDistribution,
        solutionsByAnalyste,
      );

      this.assignModuleToAnalyste(
        modules[2],
        recipientIds[2],
        solutionsDistribution,
        solutionsByAnalyste,
      );

      if (modules.length >= 4) {
        this.distributeModuleToAll(
          modules[3],
          recipientIds,
          solutionsDistribution,
          solutionsByAnalyste,
        );
      }

      return { solutionsDistribution, solutionsByAnalyste };
    }

    // Cas général : round-robin sur tous les modules
    modules.forEach((module, moduleIndex) => {
      const analysteIndex = moduleIndex % recipientIds.length;
      const analysteId = recipientIds[analysteIndex];
      this.assignModuleToAnalyste(
        module,
        analysteId,
        solutionsDistribution,
        solutionsByAnalyste,
      );
    });

    return { solutionsDistribution, solutionsByAnalyste };
  }

  private assignModuleToAnalyste(
    module: ModuleEntity,
    analysteId: string,
    solutionsDistribution: SolutionsDistribution[],
    solutionsByAnalyste: SolutionsByAnalyste,
  ): void {
    const moduleId = this.getModuleId(module);
    const allSolutions = module.solutions ?? [];
    const solutionsWithIndex: SolutionWithIndex[] = allSolutions.map(
      (text, i) => ({ index: i + 1, text }),
    );

    solutionsDistribution.push({
      moduleId,
      allocations: {
        [analysteId]: solutionsWithIndex,
      },
    });

    if (!solutionsByAnalyste[analysteId]) {
      solutionsByAnalyste[analysteId] = [];
    }
    solutionsByAnalyste[analysteId].push({
      moduleId,
      solutions: solutionsWithIndex,
    });
  }

  private distributeModuleRoundRobin(
    module: ModuleEntity,
    recipientIds: string[],
    solutionsDistribution: SolutionsDistribution[],
    solutionsByAnalyste: SolutionsByAnalyste,
  ): void {
    const moduleId = this.getModuleId(module);
    const steps = module.solutions ?? [];
    const allocations: Record<string, SolutionWithIndex[]> = {};

    recipientIds.forEach((id) => {
      allocations[id] = [];
    });

    if (steps.length > 0 && recipientIds.length > 0) {
      steps.forEach((step, idx) => {
        const target = recipientIds[idx % recipientIds.length];
        allocations[target].push({ index: idx + 1, text: step });
      });
    }

    solutionsDistribution.push({
      moduleId,
      allocations,
    });

    Object.entries(allocations).forEach(([analysteId, solutions]) => {
      if (!solutionsByAnalyste[analysteId]) {
        solutionsByAnalyste[analysteId] = [];
      }
      if (solutions.length > 0) {
        solutionsByAnalyste[analysteId].push({
          moduleId,
          solutions,
        });
      }
    });
  }

  /**
   * Distribue un module à tous les analystes (toutes les solutions à chacun)
   */
  private distributeModuleToAll(
    module: ModuleEntity,
    recipientIds: string[],
    solutionsDistribution: SolutionsDistribution[],
    solutionsByAnalyste: SolutionsByAnalyste,
  ): void {
    const moduleId = this.getModuleId(module);
    const allSolutions = module.solutions ?? [];
    const solutionsWithIndex: SolutionWithIndex[] = allSolutions.map(
      (text, i) => ({ index: i + 1, text }),
    );
    const allocations: Record<string, SolutionWithIndex[]> = {};

    recipientIds.forEach((id) => {
      allocations[id] = [...solutionsWithIndex];
    });

    solutionsDistribution.push({
      moduleId,
      allocations,
    });

    recipientIds.forEach((analysteId) => {
      if (!solutionsByAnalyste[analysteId]) {
        solutionsByAnalyste[analysteId] = [];
      }
      if (solutionsWithIndex.length > 0) {
        solutionsByAnalyste[analysteId].push({
          moduleId,
          solutions: solutionsWithIndex,
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
    solutionsByAnalyste: SolutionsByAnalyste;
  } {
    const solutionsDistribution: SolutionsDistribution[] = [];
    const solutionsByAnalyste: SolutionsByAnalyste = {};

    recipientIds.forEach((id) => {
      solutionsByAnalyste[id] = [];
    });

    if (modules.length === 0) {
      return { solutionsDistribution, solutionsByAnalyste };
    }

    // Pour chaque module, répartir ses solutions en round-robin entre tous les analystes
    modules.forEach((module) => {
      const moduleId = this.getModuleId(module);
      const steps = module.solutions ?? [];
      const allocations: Record<string, SolutionWithIndex[]> = {};

      recipientIds.forEach((id) => {
        allocations[id] = [];
      });

      if (steps.length > 0 && recipientIds.length > 0) {
        steps.forEach((step, idx) => {
          const target = recipientIds[idx % recipientIds.length];
          allocations[target].push({ index: idx + 1, text: step });
        });
      }

      solutionsDistribution.push({
        moduleId,
        allocations,
      });

      Object.entries(allocations).forEach(([analysteId, solutions]) => {
        if (!solutionsByAnalyste[analysteId]) {
          solutionsByAnalyste[analysteId] = [];
        }
        if (solutions.length > 0) {
          solutionsByAnalyste[analysteId].push({
            moduleId,
            solutions,
          });
        }
      });
    });

    return { solutionsDistribution, solutionsByAnalyste };
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

import { ModuleEntity } from 'src/game/modules/module.schema';

/** Format envoyé au frontend : index (1-based) + texte pour afficher "Solution 3" */
export type SolutionWithIndex = { index: number; text: string };

export type SolutionsDistribution = {
  moduleId: string;
  allocations: Record<string, SolutionWithIndex[]>;
};

export type SolutionsByAnalyste = Record<
  string,
  Array<{ moduleId: string; solutions: SolutionWithIndex[] }>
>;

export const distributeSolutions = (
  modules: ModuleEntity[],
  recipientIds: string[],
): SolutionsDistribution[] => {
  return modules.map((module) => {
    const steps = module.solutions ?? [];
    const allocations: Record<string, SolutionWithIndex[]> = {};
    recipientIds.forEach((id) => {
      allocations[id] = [];
    });

    if (steps.length === 0 || recipientIds.length === 0) {
      return {
        moduleId: getModuleId(module),
        allocations,
      };
    }

    steps.forEach((step, idx) => {
      const target = recipientIds[idx % recipientIds.length];
      allocations[target].push({ index: idx + 1, text: step });
    });

    return {
      moduleId: getModuleId(module),
      allocations,
    };
  });
};

export const buildSolutionsByAnalyste = (
  distribution: SolutionsDistribution[],
): SolutionsByAnalyste => {
  const byAnalyste: SolutionsByAnalyste = {};

  distribution.forEach(({ moduleId, allocations }) => {
    Object.entries(allocations).forEach(([analysteId, steps]) => {
      if (!byAnalyste[analysteId]) {
        byAnalyste[analysteId] = [];
      }
      byAnalyste[analysteId].push({ moduleId, solutions: steps });
    });
  });

  return byAnalyste;
};

const getModuleId = (module: ModuleEntity): string => {
  const maybeDoc = module as ModuleEntity & {
    _id?: { toString: () => string };
  };
  if (maybeDoc._id && typeof maybeDoc._id.toString === 'function') {
    return maybeDoc._id.toString();
  }
  return module.name;
};

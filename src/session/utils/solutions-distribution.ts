import { ModuleEntity } from 'src/game/modules/module.schema';

export type SolutionsDistribution = {
  moduleId: string;
  allocations: Record<string, string[]>;
};

export type SolutionsByOperator = Record<
  string,
  Array<{ moduleId: string; solutions: string[] }>
>;

export const distributeSolutions = (
  modules: ModuleEntity[],
  recipientIds: string[],
): SolutionsDistribution[] => {
  return modules.map((module) => {
    const steps = module.solutions ?? [];
    const allocations: Record<string, string[]> = {};
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
      allocations[target].push(step);
    });

    return {
      moduleId: getModuleId(module),
      allocations,
    };
  });
};

export const buildSolutionsByOperator = (
  distribution: SolutionsDistribution[],
): SolutionsByOperator => {
  const byOperator: SolutionsByOperator = {};

  distribution.forEach(({ moduleId, allocations }) => {
    Object.entries(allocations).forEach(([operatorId, steps]) => {
      if (!byOperator[operatorId]) {
        byOperator[operatorId] = [];
      }
      byOperator[operatorId].push({ moduleId, solutions: steps });
    });
  });

  return byOperator;
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

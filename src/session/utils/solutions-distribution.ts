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

export const getModuleId = (module: ModuleEntity): string => {
  const doc = module as ModuleEntity & { _id?: { toString: () => string } };
  return doc._id?.toString?.() ?? module.name;
};

export const toSolutionsWithIndex = (
  solutions: string[],
): SolutionWithIndex[] => solutions.map((text, i) => ({ index: i + 1, text }));

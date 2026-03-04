import { GameDifficulty, DifficultyConfig } from '../types/gameplay.types';

export const DIFFICULTY_CONFIGS: Record<GameDifficulty, DifficultyConfig> = {
  Easy: {
    maxTime: 1200, // 20 minutes
    label: 'Facile',
  },
  Medium: {
    maxTime: 900, // 15 minutes
    label: 'Moyen',
  },
  Hard: {
    maxTime: 600, // 10 minutes
    label: 'Difficile',
  },
};

export const getDifficultyConfig = (
  difficulty: GameDifficulty,
): DifficultyConfig => {
  return DIFFICULTY_CONFIGS[difficulty];
};

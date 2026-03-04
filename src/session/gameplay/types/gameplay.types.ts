export type GameDifficulty = 'Easy' | 'Medium' | 'Hard';

export type GameMode = 'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT';

export type DifficultyConfig = {
  maxTime: number;
  label: string;
};

export type GameplayConfig = {
  difficulty: GameDifficulty;
  gameMode: GameMode;
};

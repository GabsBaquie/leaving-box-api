import { GameDifficulty, GameMode } from '../gameplay/types/gameplay.types';

export const MAX_ANALYSTES_PER_SESSION = 1;
export const SESSION_CODE_LENGTH = 4;
export const DEFAULT_GAME_DIFFICULTY: GameDifficulty = 'Medium';
export const DEFAULT_GAME_MODE: GameMode = 'ONE_OPERATOR_ONE_MODULE';
export const TIMER_TICK_INTERVAL_MS = 1000;
export const OPERATOR_ACTIONS_HISTORY_LIMIT = 100;
export const BACK_NAVIGATION_SEARCH_WINDOW = 20;

export const PLAYER_ROLES = {
  AGENT: 'agent',
  ANALYSTE: 'analyste',
} as const;

export const GAME_RESULTS = {
  WIN: 'Win',
  LOSE: 'Lose',
} as const;

import { GameDifficulty, GameMode } from '../gameplay/types/gameplay.types';

export type PlayerRole = 'agent' | 'analyste';

export type Player = {
  id: string;
  role: PlayerRole;
  label: string; // ex: analyste 1, analyste 2, agent
};

export type OperatorAction = {
  operatorId: string;
  action: string; // ex: 'navigate', 'interact', 'back'
  timestamp: Date;
  data?: Record<string, unknown>; // Données supplémentaires de l'action
};

export interface Session {
  id: string;
  code: string;
  agentId: string;
  maxTime: number;
  remainingTime: number;
  timerStarted: boolean;
  createdAt: Date;
  players: Player[];
  started: boolean;
  operatorActions?: OperatorAction[]; // Historique des actions des opérateurs
  difficulty: GameDifficulty;
  gameMode: GameMode;
}

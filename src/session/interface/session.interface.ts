import { GameDifficulty, GameMode } from '../gameplay/types/gameplay.types';

export type PlayerRole = 'agent' | 'analyste';

export type Player = {
  id: string;
  role: PlayerRole;
  label: string;
};

export type OperatorAction = {
  operatorId: string;
  action: string;
  timestamp: Date;
  data?: Record<string, unknown>;
};

export type GameResult = 'Win' | 'Lose';

export type Session = {
  id: string;
  code: string;
  agentId: string;
  maxTime: number;
  remainingTime: number;
  timerStarted: boolean;
  createdAt: Date;
  players: Player[];
  started: boolean;
  operatorActions?: OperatorAction[];
  difficulty: GameDifficulty;
  gameMode: GameMode;
  gameResult?: GameResult;
};

/** Payloads WebSocket */
export type CreateSessionPayload = {
  difficulty: GameDifficulty;
  gameMode?: GameMode;
  role: PlayerRole;
};

export type GatewayErrorResponse = {
  success: false;
  message: string;
};

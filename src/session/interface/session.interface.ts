export type PlayerRole = 'agent' | 'operator';

export type Player = {
  id: string;
  role: PlayerRole;
  label: string; // ex: operator 1, operator 2, agent
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
}

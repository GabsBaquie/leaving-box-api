export interface Session {
  id: string;
  code: string;
  agentId: string;
  maxTime: number;
  remainingTime: number;
  timerStarted: boolean;
  createdAt: Date;
  players: string[];
  started: boolean;
}

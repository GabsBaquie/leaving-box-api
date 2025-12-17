import { Injectable } from '@nestjs/common';
import {
  Player,
  PlayerRole,
  Session,
} from 'src/session/interface/session.interface';
import {
  createAgentPlayer,
  createOperatorPlayer,
} from 'src/session/utils/players';
import { RedisService } from 'src/session/redis/redis.service';
import CreateSessionDto from 'src/session/ressource/createSession.ressource';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SessionService {
  constructor(private readonly redisService: RedisService) {}

  async createSession({
    difficulty,
    agentId,
  }: CreateSessionDto): Promise<Session> {
    const code = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
    let maxTime = 900;
    if (difficulty === 'Easy') {
      maxTime = 900;
    }
    if (difficulty === 'Medium') {
      maxTime = 600;
    }
    if (difficulty === 'Hard') {
      // maxTime = 480;
      maxTime = 60;
    }
    const agentPlayer: Player = createAgentPlayer(agentId);

    const newSession: Session = {
      id: uuidv4(),
      code: code,
      agentId: agentId,
      maxTime: maxTime,
      remainingTime: maxTime,
      timerStarted: false,
      createdAt: new Date(),
      players: [agentPlayer],
      started: false,
    };
    await this.redisService.set(`session:${code}`, JSON.stringify(newSession));
    return newSession;
  }

  async getAllSessions(): Promise<string[]> {
    return await this.redisService.getAll(`session`);
  }

  async getSession(sessionCode: string): Promise<Session | null> {
    const sessionData = await this.redisService.get(`session:${sessionCode}`);
    return sessionData ? (JSON.parse(sessionData) as Session) : null;
  }

  async updateSession(
    sessionCode: string,
    updatedData: Partial<Session>,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (session) {
      const newSession = { ...session, ...updatedData };
      await this.redisService.set(
        `session:${sessionCode}`,
        JSON.stringify(newSession),
      );
      return newSession;
    }
    return null;
  }

  async deleteSession(sessionCode: string): Promise<void> {
    await this.redisService.del(`session:${sessionCode}`);
  }

  // PLAYER MANAGEMENT
  async addPlayerToSession(
    sessionCode: string,
    playerId: string,
    role: PlayerRole,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (!session) {
      return null;
    }
    if (session.players.some((p) => p.id === playerId)) {
      return session;
    }

    const player: Player =
      role === 'agent'
        ? createAgentPlayer(playerId)
        : createOperatorPlayer(playerId, session.players);

    session.players.push(player);
    await this.updateSession(sessionCode, session);
    return session;
  }

  async removePlayerFromSession(
    sessionCode: string,
    playerId: string,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (!session) {
      return null;
    }
    session.players = session.players.filter((p) => p.id !== playerId);
    await this.updateSession(sessionCode, session);
    return session;
  }

  //TIMER
  async startTimer(sessionCode: string): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (!session) {
      return null;
    }
    if (session.timerStarted) {
      return null;
    }

    session.timerStarted = true;
    await this.updateSession(sessionCode, session);
    return session;
  }

  async updateTimer(
    sessionCode: string,
    remaining: number,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (!session) {
      return null;
    }
    if (session.timerStarted === false) {
      return null;
    }
    if (remaining <= 0) {
      session.timerStarted = false;
      session.remainingTime = 0;
      await this.updateSession(sessionCode, session);
      return null;
    }
    session.remainingTime = remaining;
    await this.updateSession(sessionCode, session);
    return session;
  }
}

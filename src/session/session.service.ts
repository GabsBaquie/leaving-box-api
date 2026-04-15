import { Injectable, Logger } from '@nestjs/common';
import {
  OperatorAction,
  Player,
  PlayerRole,
  Session,
} from 'src/session/interface/session.interface';
import {
  createAgentPlayer,
  createAnalystePlayer,
} from 'src/session/utils/players';
import { RedisService } from 'src/session/redis/redis.service';
import CreateSessionDto from 'src/session/ressource/createSession.ressource';
import { v4 as uuidv4 } from 'uuid';
import {
  BACK_NAVIGATION_SEARCH_WINDOW,
  DEFAULT_GAME_DIFFICULTY,
  DEFAULT_GAME_MODE,
  MAX_ANALYSTES_PER_SESSION,
  OPERATOR_ACTIONS_HISTORY_LIMIT,
  PLAYER_ROLES,
  SESSION_CODE_LENGTH,
} from './config/session.config';
import { getDifficultyConfig } from './gameplay/config/difficulty.config';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly redisService: RedisService) {}

  async createSession({
    difficulty,
    gameMode,
    agentId,
  }: CreateSessionDto): Promise<Session> {
    // Code court lisible côté front (join manuel), distinct de l'id technique.
    const code = uuidv4()
      .replace(/-/g, '')
      .slice(0, SESSION_CODE_LENGTH)
      .toUpperCase();
    const difficultyConfig = getDifficultyConfig(difficulty);
    const maxTime = difficultyConfig.maxTime;
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
      operatorActions: [],
      difficulty,
      gameMode,
    };
    await this.redisService.set(`session:${code}`, JSON.stringify(newSession));
    return newSession;
  }

  async getAllSessions(): Promise<string[]> {
    return await this.redisService.getAll(`session`);
  }

  async getSession(sessionCode: string): Promise<Session | null> {
    const sessionData = await this.redisService.get(`session:${sessionCode}`);
    if (!sessionData) {
      return null;
    }
    const session = JSON.parse(sessionData) as Session;
    // Migration : ajouter les champs manquants pour les anciennes sessions
    if (!session.difficulty) {
      session.difficulty = DEFAULT_GAME_DIFFICULTY;
    }
    if (!session.gameMode) {
      session.gameMode = DEFAULT_GAME_MODE;
    }
    return session;
  }

  async updateSession(
    sessionCode: string,
    updatedData: Partial<Session>,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (session) {
      // Merge shallow volontaire: les payloads d'update remplacent les branches ciblées.
      const newSession = { ...session, ...updatedData };
      await this.redisService.set(
        `session:${sessionCode}`,
        JSON.stringify(newSession),
      );
      return newSession;
    }
    return null;
  }

  async deleteSession(
    sessionCode: string,
    difficulty?: Session['difficulty'],
  ): Promise<string> {
    const deletedCount = await this.redisService.del(`session:${sessionCode}`);
    if (deletedCount === 1) {
      const diffPart = difficulty ? ` (difficulty: ${difficulty})` : '';
      this.logger.log(
        `Session supprimée avec succès: ${sessionCode}${diffPart}`,
      );
    } else {
      const diffPart = difficulty ? ` (difficulty: ${difficulty})` : '';
      this.logger.warn(
        `Session non trouvée (déjà supprimée?): ${sessionCode}${diffPart}`,
      );
    }
    return sessionCode;
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

    // Sécurité backend: on refuse tout analyste supplémentaire au-delà de la limite.
    if (role === PLAYER_ROLES.ANALYSTE) {
      const analysteCount = session.players.filter(
        (player) => player.role === PLAYER_ROLES.ANALYSTE,
      ).length;
      if (analysteCount >= MAX_ANALYSTES_PER_SESSION) {
        this.logger.warn('Tentative de dépassement de la limite analystes', {
          sessionCode,
          playerId,
          analysteCount,
          maxAnalystes: MAX_ANALYSTES_PER_SESSION,
        });
        throw new Error('MAX_ANALYSTES_REACHED');
      }
    }

    const player: Player =
      role === PLAYER_ROLES.AGENT
        ? createAgentPlayer(playerId)
        : createAnalystePlayer(playerId, session.players);

    session.players.push(player);
    await this.updateSession(sessionCode, session);
    if (role === PLAYER_ROLES.ANALYSTE) {
      const analysteCount = session.players.filter(
        (currentPlayer) => currentPlayer.role === PLAYER_ROLES.ANALYSTE,
      ).length;
      this.logger.log('Analyste ajouté à la file de session', {
        sessionCode,
        playerId,
        analysteCount,
        maxAnalystes: MAX_ANALYSTES_PER_SESSION,
      });
    }
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

  // OPERATOR ACTIONS TRACKING
  async addOperatorAction(
    sessionCode: string,
    operatorId: string,
    action: string,
    data?: Record<string, unknown>,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionCode);
    if (!session) {
      return null;
    }

    // Initialiser operatorActions si nécessaire (pour les sessions existantes)
    if (!session.operatorActions) {
      session.operatorActions = [];
    }

    const operatorAction: OperatorAction = {
      operatorId,
      action,
      timestamp: new Date(),
      data,
    };

    session.operatorActions.push(operatorAction);

    // Limiter l'historique à 100 actions pour éviter une croissance excessive
    if (session.operatorActions.length > OPERATOR_ACTIONS_HISTORY_LIMIT) {
      session.operatorActions = session.operatorActions.slice(
        -OPERATOR_ACTIONS_HISTORY_LIMIT,
      );
    }

    await this.updateSession(sessionCode, session);
    return session;
  }

  async getOperatorActions(
    sessionCode: string,
    operatorId?: string,
  ): Promise<OperatorAction[]> {
    const session = await this.getSession(sessionCode);
    if (!session || !session.operatorActions) {
      return [];
    }

    if (operatorId) {
      return session.operatorActions.filter(
        (action) => action.operatorId === operatorId,
      );
    }

    return session.operatorActions;
  }

  /** Détecte un retour en arrière via action 'back' ou navigation vers un état déjà visité */
  async detectBackNavigation(
    sessionCode: string,
    operatorId: string,
  ): Promise<boolean> {
    const actions = await this.getOperatorActions(sessionCode, operatorId);
    if (actions.length < 2) return false;

    const last = actions[actions.length - 1];
    const prev = actions[actions.length - 2];
    if (last.action === 'back') return true;

    const getLoc = (a: OperatorAction) =>
      a.data?.state ?? a.data?.path ?? a.data?.url;
    const current = getLoc(last);
    if (
      (last.action !== 'navigate' && last.action !== 'getSession') ||
      !current
    ) {
      return false;
    }

    // Fenêtre glissante pour limiter le coût CPU sur les longues sessions.
    const searchLimit = Math.max(
      0,
      actions.length - BACK_NAVIGATION_SEARCH_WINDOW,
    );
    for (let i = actions.length - 3; i >= searchLimit; i--) {
      const past = actions[i];
      if (
        (past.action === 'navigate' || past.action === 'getSession') &&
        past.data
      ) {
        const pastLoc = getLoc(past);
        if (pastLoc && current === pastLoc) {
          // On évite les faux positifs si la précédente action pointait déjà
          // vers cette même destination (ex: refresh ou double clic).
          const prevLoc = getLoc(prev);
          const prevWasNav =
            prev.action === 'navigate' || prev.action === 'getSession';
          if (!prevWasNav || (prevLoc && current !== prevLoc)) return true;
        }
      }
    }
    return false;
  }
}

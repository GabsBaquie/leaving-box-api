import { Injectable, Logger } from '@nestjs/common';
import {
  OperatorAction,
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
  private readonly logger = new Logger(SessionService.name);

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
      operatorActions: [],
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

  async deleteSession(sessionCode: string): Promise<string> {
    const deletedCount = await this.redisService.del(`session:${sessionCode}`);
    if (deletedCount === 1) {
      this.logger.log(`Session supprimée avec succès: ${sessionCode}`);
    } else {
      this.logger.warn(`Session non trouvée (déjà supprimée?): ${sessionCode}`);
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
    if (session.operatorActions.length > 100) {
      session.operatorActions = session.operatorActions.slice(-100);
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

  /**
   * Détecte si un opérateur a fait un retour en arrière
   * en comparant la dernière action avec les actions précédentes
   */
  async detectBackNavigation(
    sessionCode: string,
    operatorId: string,
  ): Promise<boolean> {
    const actions = await this.getOperatorActions(sessionCode, operatorId);
    
    if (actions.length < 2) {
      return false;
    }

    const lastAction = actions[actions.length - 1];
    const previousAction = actions[actions.length - 2];

    // Détecter un retour en arrière si :
    // 1. L'action actuelle est explicitement 'back'
    if (lastAction.action === 'back') {
      return true;
    }

    // 2. Si l'action actuelle est 'navigate' ou 'getSession' et qu'elle correspond à une action antérieure
    if (
      (lastAction.action === 'navigate' || lastAction.action === 'getSession') &&
      lastAction.data
    ) {
      const currentState = lastAction.data.state || lastAction.data.path || lastAction.data.url;
      const currentPath = lastAction.data.path || lastAction.data.url;
      
      if (currentState || currentPath) {
        // Chercher si cet état a déjà été visité avant la dernière action
        // On cherche dans les 20 dernières actions pour détecter les retours en arrière
        const searchLimit = Math.max(0, actions.length - 20);
        for (let i = actions.length - 3; i >= searchLimit; i--) {
          const pastAction = actions[i];
          if (
            (pastAction.action === 'navigate' || pastAction.action === 'getSession') &&
            pastAction.data
          ) {
            const pastState = pastAction.data.state || pastAction.data.path || pastAction.data.url;
            const pastPath = pastAction.data.path || pastAction.data.url;
            
            // Comparer les états/paths
            if (
              (currentState && pastState && currentState === pastState) ||
              (currentPath && pastPath && currentPath === pastPath)
            ) {
              // Vérifier que ce n'est pas juste une navigation normale vers la même page
              // Si l'action précédente était différente, c'est probablement un retour en arrière
              const prevState = previousAction.data?.state || previousAction.data?.path || previousAction.data?.url;
              const prevPath = previousAction.data?.path || previousAction.data?.url;
              
              if (
                previousAction.action !== 'navigate' &&
                previousAction.action !== 'getSession'
              ) {
                // Si l'action précédente n'était pas une navigation, c'est probablement un retour
                return true;
              }
              
              if (
                (currentState && prevState && currentState !== prevState) ||
                (currentPath && prevPath && currentPath !== prevPath)
              ) {
                // Si on revient à un état précédent après avoir été ailleurs, c'est un retour en arrière
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }
}

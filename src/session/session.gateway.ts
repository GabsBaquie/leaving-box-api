import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessionService } from './session.service';
import { ModuleService } from 'src/game/modules/module.service';
import { Session } from './interface/session.interface';
import {
  buildSolutionsByOperator,
  distributeSolutions,
} from './utils/solutions-distribution';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
  },
})
export class SessionsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly sessionService: SessionService,
    private readonly moduleService: ModuleService,
  ) {}

  // Objet pour stocker les intervalles de timer par session
  private readonly sessionTimers: { [sessionCode: string]: NodeJS.Timeout } =
    {};

  @SubscribeMessage('createSession')
  async handleCreateSession(
    @MessageBody()
    data: {
      difficulty: 'Easy' | 'Medium' | 'Hard';
      role?: 'agent' | 'operator';
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (data.role && data.role !== 'agent') {
        return {
          success: false,
          message: 'Only an agent can create a session',
        };
      }

      const session = await this.sessionService.createSession({
        difficulty: data.difficulty,
        agentId: client.id,
      });
      // Remove other rooms except the socket's own id.
      for (const room of client.rooms) {
        if (room !== client.id) {
          await this.sessionService.deleteSession(room);
          await client.leave(room);
        }
      }
      await client.join(session.code);
      client.emit('sessionCreated', session);
    } catch (error) {
      console.error(error);
      client.emit('error', { message: 'Failed to create session' });
    }
  }

  @SubscribeMessage('getSession')
  async handleGetSessions(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionCode: string; currentPath?: string },
  ) {
    const sessionData = await this.sessionService.getSession(data.sessionCode);

    if (!sessionData) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }

    // Si un opérateur envoie son chemin actuel, on peut détecter un retour en arrière
    if (data.currentPath) {
      const player = sessionData.players.find((p) => p.id === client.id);
      if (player && player.role === 'operator') {
        // Enregistrer cette requête comme une action de navigation
        await this.sessionService.addOperatorAction(
          data.sessionCode,
          client.id,
          'getSession',
          { path: data.currentPath, timestamp: new Date() },
        );

        // Détecter un retour en arrière
        const isBackNavigation = await this.sessionService.detectBackNavigation(
          data.sessionCode,
          client.id,
        );

        if (isBackNavigation) {
          const backNavData = {
            sessionCode: data.sessionCode,
            operatorId: client.id,
            operatorLabel: player.label,
            timestamp: new Date(),
            path: data.currentPath,
            autoDetected: true,
          };

          const agentSocket = this.server.sockets.sockets.get(sessionData.agentId);
          if (agentSocket) {
            agentSocket.emit('operatorBackNavigation', backNavData);
          }
        }
      }
    }

    const clients = await this.server.in(data.sessionCode).fetchSockets();
    const clientsInfo = clients.map((socket) => ({
      id: socket.id,
      rooms: Array.from(socket.rooms),
    }));

    if (client.rooms.has(data.sessionCode)) {
      client.emit('currentSession', {
        sessionCode: data.sessionCode,
        sessionData,
        connectedClients: clientsInfo,
      });
    }

    return { success: true };
  }

  @SubscribeMessage('joinSession')
  async handleJoin(
    @MessageBody() data: { sessionCode: string; player: string },
    @ConnectedSocket() client: Socket,
  ) {
    const rooms = client.rooms;
    for (const room of rooms) {
      if (room !== client.id) {
        await client.leave(room);
      }
    }
    await client.join(data.sessionCode);

    const session = await this.sessionService.addPlayerToSession(
      data.sessionCode,
      client.id,
      'operator',
    );
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }

    this.server.to(data.sessionCode).emit('playerJoined', {
      playerId: client.id,
      playerLabel: session.players.find((p) => p.id === client.id)?.label,
      session,
    });

    return { success: true };
  }

  @SubscribeMessage('leaveSession')
  async handleLeave(
    @MessageBody() data: { sessionCode: string; player: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Gérer le retrait du joueur
    const removalResult = await this.handlePlayerRemoval(
      data.sessionCode,
      client.id,
    );

    if (!removalResult.session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }

    // Le client quitte la salle correspondant à la session
    await client.leave(data.sessionCode);

    // Si la session doit être fermée
    if (removalResult.shouldClose && removalResult.reason) {
      await this.closeSession(data.sessionCode, removalResult.reason);
      return { success: true, sessionClosed: true };
    }

    // Informe tous les clients de la salle que le joueur a quitté
    this.server.to(data.sessionCode).emit('playerLeft', {
      playerId: client.id,
      session: removalResult.session,
    });

    return { success: true };
  }

  @SubscribeMessage('startGame')
  async handleStartGame(
    @MessageBody() data: { sessionCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    const session = await this.sessionService.getSession(data.sessionCode);
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }
    if (session.agentId !== client.id) {
      return {
        success: false,
        message: 'Only the agent can start the game',
      };
    }

    const updatedSession =
      (await this.sessionService.updateSession(data.sessionCode, {
        started: true,
      })) ?? session;
    const operators = updatedSession.players.filter(
      (p) => p.role === 'operator',
    );
    if (operators.length === 0) {
      return {
        success: false,
        message: 'At least one operator is required to start the game',
      };
    }

    const moduleManuals = await this.moduleService.findSome(5);
    const recipients = operators.map((op) => op.id);
    const solutionsDistribution = distributeSolutions(
      moduleManuals,
      recipients,
    );
    const solutionsByOperator = buildSolutionsByOperator(solutionsDistribution);
    const moduleManualsWithoutSolutions = moduleManuals.map((m) => {
      const plain = { ...(m as unknown as Record<string, unknown>) };
      delete plain.solutions;
      return plain;
    });

    this.server.to(data.sessionCode).emit('gameStarted', {
      session: updatedSession,
      moduleManuals: moduleManualsWithoutSolutions,
      solutionsDistribution,
      solutionsByOperator,
    });

    return { success: true };
  }

  @SubscribeMessage('clearSession')
  async handleClearSession(
    @MessageBody() data: { sessionCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const session = await this.sessionService.getSession(data.sessionCode);
      if (!session) {
        return {
          success: false,
          message: `Session with code ${data.sessionCode} does not exist`,
        };
      }
      if (session.agentId !== client.id) {
        return {
          success: false,
          message: 'Only the agent can clear the session',
        };
      }

      await this.sessionService.deleteSession(data.sessionCode);
      this.server
        .to(data.sessionCode)
        .emit('sessionCleared', { sessionCode: data.sessionCode });
      await this.stopGameTimer(data.sessionCode);
      this.server.to(data.sessionCode).socketsLeave(data.sessionCode);

      return { success: true };
    } catch (error) {
      console.error('Failed to clear session:', error);
      return { success: false, message: 'Failed to clear session' };
    }
  }

  @SubscribeMessage('startTimer')
  async handleStartTimer(
    @MessageBody() data: { sessionCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    const session = await this.sessionService.getSession(data.sessionCode);
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }
    const operators = session.players.filter((p) => p.role === 'operator');
    if (operators.length === 0) {
      return {
        success: false,
        message: 'At least one operator is required to start the timer',
      };
    }
    if (session.agentId !== client.id) {
      return {
        success: false,
        message: 'Only the agent can start the timer',
      };
    }
    if (session.timerStarted) {
      return {
        success: false,
        message: 'Timer already started',
      };
    }

    const updatedSession = await this.sessionService.startTimer(
      data.sessionCode,
    );
    if (!updatedSession) {
      return { success: false, message: 'Failed to start timer' };
    }
    this.startGameTimer(data.sessionCode, updatedSession);
    return { success: true };
  }

  @SubscribeMessage('stopTimer')
  async handleStopTimer(
    @MessageBody() data: { sessionCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    const session = await this.sessionService.getSession(data.sessionCode);
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }
    if (session.agentId !== client.id) {
      return {
        success: false,
        message: 'Only the agent can stop the timer',
      };
    }

    await this.stopGameTimer(data.sessionCode);
    return { success: true };
  }

  /**
   * Enregistre une action d'un opérateur (navigation, interaction, etc.)
   * Permet de suivre l'historique des actions pour détecter les retours en arrière
   */
  @SubscribeMessage('operatorAction')
  async handleOperatorAction(
    @MessageBody()
    data: {
      sessionCode: string;
      action: string;
      data?: Record<string, unknown>;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const session = await this.sessionService.getSession(data.sessionCode);
      if (!session) {
        return {
          success: false,
          message: `Session with code ${data.sessionCode} does not exist`,
        };
      }

      // Vérifier que le client est un opérateur dans cette session
      const player = session.players.find((p) => p.id === client.id);
      if (!player || player.role !== 'operator') {
        return {
          success: false,
          message: 'Only operators can send actions',
        };
      }

      // Enregistrer l'action
      const updatedSession = await this.sessionService.addOperatorAction(
        data.sessionCode,
        client.id,
        data.action,
        data.data,
      );

      if (!updatedSession) {
        return {
          success: false,
          message: 'Failed to record action',
        };
      }

      // Détecter automatiquement un retour en arrière
      const isBackNavigation = await this.sessionService.detectBackNavigation(
        data.sessionCode,
        client.id,
      );

      if (isBackNavigation) {
        // Notifier l'agent qu'un opérateur a fait un retour en arrière
        const operatorLabel = player.label;
        const backNavData = {
          sessionCode: data.sessionCode,
          operatorId: client.id,
          operatorLabel,
          timestamp: new Date(),
          autoDetected: true,
          action: data.action,
          data: data.data,
        };

        // Vérifier que l'agent est toujours connecté
        const agentSocket = this.server.sockets.sockets.get(session.agentId);
        if (agentSocket) {
          agentSocket.emit('operatorBackNavigation', backNavData);
        } else {
          console.warn('Agent not connected for auto-detected back navigation', {
            sessionCode: data.sessionCode,
            agentId: session.agentId,
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error handling operator action:', error);
      return {
        success: false,
        message: 'Failed to process action',
      };
    }
  }

  /**
   * Événement simple pour signaler un retour en arrière
   * Le client peut appeler cet événement directement quand il détecte un retour en arrière
   * Format minimal : { sessionCode: string }
   */
  @SubscribeMessage('back')
  async handleBack(
    @MessageBody() data: { sessionCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Rediriger vers handleOperatorBackNavigation
    return this.handleOperatorBackNavigation(
      { sessionCode: data.sessionCode },
      client,
    );
  }

  /**
   * Événement explicite pour signaler un retour en arrière
   * Le client peut appeler cet événement directement quand il détecte un retour en arrière
   */
  @SubscribeMessage('operatorBackNavigation')
  async handleOperatorBackNavigation(
    @MessageBody() data: { sessionCode: string; path?: string; state?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const session = await this.sessionService.getSession(data.sessionCode);
      if (!session) {
        console.error('Session not found', { sessionCode: data.sessionCode });
        return {
          success: false,
          message: `Session with code ${data.sessionCode} does not exist`,
        };
      }

      // Vérifier que le client est dans la session
      const player = session.players.find((p) => p.id === client.id);
      if (!player) {
        console.error('Player not found in session', {
          clientId: client.id,
          sessionCode: data.sessionCode,
        });
        return {
          success: false,
          message: 'Player not found in session',
        };
      }

      // Si c'est l'agent qui fait un retour en arrière, on log mais on ne notifie pas
      if (player.role === 'agent') {
        // Enregistrer l'action pour l'historique
        await this.sessionService.addOperatorAction(
          data.sessionCode,
          client.id,
          'back',
          {
            reported: true,
            timestamp: new Date(),
            path: data.path,
            state: data.state,
            role: 'agent',
          },
        );
        return { success: true, message: 'Agent back navigation recorded' };
      }

      // Si c'est un opérateur, on enregistre et on notifie l'agent
      if (player.role !== 'operator') {
        console.error('Invalid role for back navigation', {
          clientId: client.id,
          role: player.role,
        });
        return {
          success: false,
          message: 'Only operators and agents can report back navigation',
        };
      }

      // Enregistrer l'action de retour en arrière
      const updatedSession = await this.sessionService.addOperatorAction(
        data.sessionCode,
        client.id,
        'back',
        {
          reported: true,
          timestamp: new Date(),
          path: data.path,
          state: data.state,
        },
      );

      if (!updatedSession) {
        console.error('Failed to add operator action');
        return {
          success: false,
          message: 'Failed to record back navigation',
        };
      }

      // Notifier l'agent
      const backNavData = {
        sessionCode: data.sessionCode,
        operatorId: client.id,
        operatorLabel: player.label,
        timestamp: new Date(),
        path: data.path,
        state: data.state,
      };

      // Vérifier que l'agent est toujours connecté
      const agentSocket = this.server.sockets.sockets.get(session.agentId);
      if (agentSocket) {
        agentSocket.emit('operatorBackNavigation', backNavData);
      } else {
        console.warn('Agent not connected for back navigation', {
          sessionCode: data.sessionCode,
          agentId: session.agentId,
        });
      }

      // Aussi diffuser à toute la session pour le debug (optionnel)
      this.server.to(data.sessionCode).emit('operatorBackNavigationDetected', {
        sessionCode: data.sessionCode,
        operatorId: client.id,
        operatorLabel: player.label,
        timestamp: new Date(),
      });

      return { success: true, data: backNavData };
    } catch (error) {
      console.error('Error handling back navigation:', error);
      return {
        success: false,
        message: 'Failed to report back navigation',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Permet à l'agent de récupérer l'historique des actions d'un opérateur
   */
  @SubscribeMessage('getOperatorActions')
  async handleGetOperatorActions(
    @MessageBody()
    data: { sessionCode: string; operatorId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const session = await this.sessionService.getSession(data.sessionCode);
      if (!session) {
        return {
          success: false,
          message: `Session with code ${data.sessionCode} does not exist`,
        };
      }

      // Seul l'agent peut consulter les actions
      if (session.agentId !== client.id) {
        return {
          success: false,
          message: 'Only the agent can view operator actions',
        };
      }

      const actions = await this.sessionService.getOperatorActions(
        data.sessionCode,
        data.operatorId,
      );

      client.emit('operatorActionsHistory', {
        sessionCode: data.sessionCode,
        operatorId: data.operatorId,
        actions,
      });

      return { success: true };
    } catch (error) {
      console.error('Error getting operator actions:', error);
      return {
        success: false,
        message: 'Failed to get operator actions',
      };
    }
  }

  startGameTimer(sessionCode: string, session: Session) {
    let remaining = session.maxTime;

    this.server.to(sessionCode).emit('timerUpdate', { remaining });

    const tick = async () => {
      // Vérifier si le timer doit continuer
      const timerCheck = await this.shouldTimerContinue(sessionCode);

      if (!timerCheck.shouldContinue) {
        // Arrêter le timer
        clearInterval(interval);
        delete this.sessionTimers[sessionCode];
        console.log('Timer stopped', {
          sessionCode,
          reason: timerCheck.reason,
        });
        return;
      }

      remaining -= 1;

      await this.sessionService.updateTimer(sessionCode, remaining);
      this.server.to(sessionCode).emit('timerUpdate', { remaining });

      if (remaining <= 0) {
        clearInterval(interval);
        delete this.sessionTimers[sessionCode];
        this.server
          .to(sessionCode)
          .emit('gameOver', { message: 'Le temps est écoulé !' });
        await this.sessionService.updateTimer(sessionCode, 0);
      }
    };

    const interval = setInterval(() => {
      void tick();
    }, 1000);

    this.sessionTimers[sessionCode] = interval;
  }

  async stopGameTimer(sessionCode: string) {
    if (this.sessionTimers[sessionCode]) {
      clearInterval(this.sessionTimers[sessionCode]);
      delete this.sessionTimers[sessionCode];
      await this.sessionService.updateTimer(sessionCode, 0);
      this.server.to(sessionCode).emit('timerStopped', { sessionCode });
    }
  }

  /**
   * Gère la déconnexion d'un client
   * Si l'agent se déconnecte, la partie est fermée
   * Si un opérateur se déconnecte et qu'il ne reste plus d'opérateurs, la partie est fermée
   */
  async handleDisconnect(client: Socket) {
    try {
      // Récupérer toutes les sessions pour trouver celles où le client est présent
      const sessionKeys = await this.sessionService.getAllSessions();

      for (const sessionKey of sessionKeys) {
        const sessionCode = sessionKey.replace('session:', '');
        const session = await this.sessionService.getSession(sessionCode);

        if (!session) {
          continue;
        }

        // Vérifier si le client déconnecté est dans cette session
        const player = session.players.find((p) => p.id === client.id);

        if (!player) {
          continue;
        }

        // Gérer le retrait du joueur
        const removalResult = await this.handlePlayerRemoval(
          sessionCode,
          client.id,
        );

        if (!removalResult.session) {
          continue;
        }

        // Si la session doit être fermée
        if (removalResult.shouldClose && removalResult.reason) {
          console.log('Session closing due to disconnect', {
            sessionCode,
            disconnectedPlayerId: client.id,
            disconnectedPlayerRole: player.role,
            reason: removalResult.reason,
          });
          await this.closeSession(sessionCode, removalResult.reason);
          continue;
        }

        // Si la session reste active, informer les autres clients que le joueur a quitté
        this.server.to(sessionCode).emit('playerLeft', {
          playerId: client.id,
          session: removalResult.session,
        });
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  /**
   * Ferme une session (méthode privée réutilisable)
   */
  private async closeSession(sessionCode: string, reason: string) {
    try {
      // Arrêter le timer si actif
      await this.stopGameTimer(sessionCode);

      // Supprimer la session de Redis
      await this.sessionService.deleteSession(sessionCode);

      // Informer tous les clients de la fermeture
      this.server.to(sessionCode).emit('gameOver', {
        message: reason,
        sessionCode,
      });

      // Éjecter tous les sockets de la room
      this.server.to(sessionCode).socketsLeave(sessionCode);

      console.log('Session closed', { sessionCode, reason });
    } catch (error) {
      console.error('Error closing session:', error);
    }
  }

  // ==================== MÉTHODES DE VALIDATION ====================

  /**
   * Vérifie si une session respecte les exigences minimales (1 agent + 1 opérateur)
   */
  private validateSessionRequirements(session: Session): {
    isValid: boolean;
    hasAgent: boolean;
    hasOperator: boolean;
    reason?: string;
  } {
    const hasAgent = session.players.some((p) => p.role === 'agent');
    const hasOperator = session.players.some((p) => p.role === 'operator');
    const isValid = hasAgent && hasOperator;

    let reason: string | undefined;
    if (!isValid) {
      reason = !hasAgent
        ? "L'agent a quitté la session"
        : 'Tous les opérateurs ont quitté la session';
    }

    return { isValid, hasAgent, hasOperator, reason };
  }

  /**
   * Détermine si une session doit être fermée après le retrait d'un joueur
   */
  private shouldCloseSession(session: Session | null): {
    shouldClose: boolean;
    reason?: string;
  } {
    if (!session) {
      return { shouldClose: true, reason: 'Session introuvable' };
    }

    const validation = this.validateSessionRequirements(session);
    return {
      shouldClose: !validation.isValid,
      reason: validation.reason,
    };
  }

  // ==================== MÉTHODES DE GESTION DES JOUEURS ====================

  /**
   * Récupère les informations sur les joueurs d'une session
   */
  private getSessionPlayersInfo(session: Session): {
    agents: Session['players'];
    operators: Session['players'];
    agentCount: number;
    operatorCount: number;
  } {
    const agents = session.players.filter((p) => p.role === 'agent');
    const operators = session.players.filter((p) => p.role === 'operator');

    return {
      agents,
      operators,
      agentCount: agents.length,
      operatorCount: operators.length,
    };
  }

  /**
   * Gère le retrait d'un joueur et vérifie si la session doit être fermée
   */
  private async handlePlayerRemoval(
    sessionCode: string,
    playerId: string,
  ): Promise<{
    session: Session | null;
    shouldClose: boolean;
    reason?: string;
  }> {
    // Retirer le joueur de la session
    const session = await this.sessionService.removePlayerFromSession(
      sessionCode,
      playerId,
    );

    // Vérifier si la session doit être fermée
    const closeCheck = this.shouldCloseSession(session);

    return {
      session,
      shouldClose: closeCheck.shouldClose,
      reason: closeCheck.reason,
    };
  }

  // ==================== MÉTHODES DE GESTION DU TIMER ====================

  /**
   * Vérifie si le timer doit continuer à tourner
   */
  private async shouldTimerContinue(sessionCode: string): Promise<{
    shouldContinue: boolean;
    reason?: string;
  }> {
    const session = await this.sessionService.getSession(sessionCode);

    if (!session) {
      return {
        shouldContinue: false,
        reason: "Session n'existe plus",
      };
    }

    const validation = this.validateSessionRequirements(session);
    return {
      shouldContinue: validation.isValid,
      reason: validation.reason,
    };
  }
}

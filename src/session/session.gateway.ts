import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionService } from './session.service';
import { ModuleService } from 'src/game/modules/module.service';
import { Session } from './interface/session.interface';
import { GameplayService } from './gameplay/gameplay.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
})
export class SessionsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SessionsGateway.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly moduleService: ModuleService,
    private readonly gameplayService: GameplayService,
  ) {}

  // Objet pour stocker les intervalles de timer par session
  private readonly sessionTimers: { [sessionCode: string]: NodeJS.Timeout } =
    {};

  @SubscribeMessage('createSession')
  async handleCreateSession(
    @MessageBody()
    data: {
      difficulty: 'Easy' | 'Medium' | 'Hard';
      gameMode?: 'ONE_OPERATOR_ONE_MODULE' | 'RANDOM_ONE_MODULE_SPLIT';
      role: 'agent' | 'analyste';
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Vérifier que le role est fourni
      if (!data.role) {
        return {
          success: false,
          message: 'Role is required',
        };
      }

      // La difficulté doit être choisie par le joueur
      if (!data.difficulty) {
        return {
          success: false,
          message:
            'Difficulty is required. Please choose Easy, Medium or Hard.',
        };
      }

      const difficulty = data.difficulty;

      // Vérifier que seul un agent peut créer une session
      if (data.role !== 'agent') {
        return {
          success: false,
          message: 'Only an agent can create a session',
        };
      }

      // Mode de jeu par défaut si non fourni
      const gameMode = data.gameMode || 'ONE_OPERATOR_ONE_MODULE';

      const session = await this.sessionService.createSession({
        difficulty,
        gameMode,
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
      this.logger.error('Erreur lors de la création de session:', error);
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
      if (player && player.role === 'analyste') {
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

          const agentSocket = this.server.sockets.sockets.get(
            sessionData.agentId,
          );
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
      'analyste',
    );
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }

    const player = session.players.find((p) => p.id === client.id);
    if (!player) {
      return {
        success: false,
        message: 'Failed to add player to session',
      };
    }

    this.server.to(data.sessionCode).emit('playerJoined', {
      playerId: client.id,
      playerLabel: player.label,
      playerRole: player.role, // OBLIGATOIRE
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
    const analystes = updatedSession.players.filter(
      (p) => p.role === 'analyste',
    );
    if (analystes.length === 0) {
      return {
        success: false,
        message: 'At least one analyste is required to start the game',
      };
    }

    try {
      // Utiliser le service de gameplay pour démarrer la partie
      const analysteIds = analystes.map((a) => a.id);
      // Valeurs par défaut pour compatibilité avec les anciennes sessions
      const difficulty = session.difficulty || 'Medium';
      const gameMode = session.gameMode || 'ONE_OPERATOR_ONE_MODULE';

      const gameplayResult = await this.gameplayService.startGameWithOperators(
        {
          difficulty,
          gameMode,
        },
        analysteIds,
      );

      this.server.to(data.sessionCode).emit('gameStarted', {
        session: updatedSession,
        moduleManuals: gameplayResult.moduleManuals,
        solutionsDistribution: gameplayResult.solutionsDistribution,
        solutionsByOperator: gameplayResult.solutionsByOperator,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Erreur lors du démarrage du jeu:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to start the game',
      };
    }
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
      this.logger.error('Erreur lors de la suppression de session:', error);
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
    const analystes = session.players.filter((p) => p.role === 'analyste');
    if (analystes.length === 0) {
      return {
        success: false,
        message: 'At least one analyste is required to start the timer',
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
      if (!player || player.role !== 'analyste') {
        return {
          success: false,
          message: 'Only analystes can send actions',
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
          this.logger.warn(
            'Agent non connecté pour la détection automatique du retour en arrière',
            {
              sessionCode: data.sessionCode,
              agentId: session.agentId,
            },
          );
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        "Erreur lors du traitement de l'action opérateur:",
        error,
      );
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
        this.logger.error('Session non trouvée', {
          sessionCode: data.sessionCode,
        });
        return {
          success: false,
          message: `Session with code ${data.sessionCode} does not exist`,
        };
      }

      // Vérifier que le client est dans la session
      const player = session.players.find((p) => p.id === client.id);
      if (!player) {
        this.logger.error('Joueur non trouvé dans la session', {
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
      if (player.role !== 'analyste') {
        this.logger.error('Rôle invalide pour le retour en arrière', {
          clientId: client.id,
          role: player.role,
        });
        return {
          success: false,
          message: 'Only analystes and agents can report back navigation',
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
        this.logger.error("Échec de l'ajout de l'action opérateur");
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
        this.logger.warn('Agent non connecté pour le retour en arrière', {
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
      this.logger.error(
        'Erreur lors du traitement du retour en arrière:',
        error,
      );
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
      this.logger.error(
        'Erreur lors de la récupération des actions opérateur:',
        error,
      );
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
        this.logger.log('Timer arrêté', {
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
          this.logger.warn('Fermeture de session due à la déconnexion', {
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
      this.logger.error('Erreur lors de la gestion de la déconnexion:', error);
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

      this.logger.log('Session fermée', { sessionCode, reason });
    } catch (error) {
      this.logger.error('Erreur lors de la fermeture de session:', error);
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
    const hasAnalyste = session.players.some((p) => p.role === 'analyste');
    const isValid = hasAgent && hasAnalyste;

    let reason: string | undefined;
    if (!isValid) {
      reason = !hasAgent
        ? "L'agent a quitté la session"
        : 'Tous les analystes ont quitté la session';
    }

    return { isValid, hasAgent, hasOperator: hasAnalyste, reason };
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
    const analystes = session.players.filter((p) => p.role === 'analyste');

    return {
      agents,
      operators: analystes,
      agentCount: agents.length,
      operatorCount: analystes.length,
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

import {
  ConnectedSocket,
  MessageBody,
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
export class SessionsGateway {
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
      console.log('sessionCreated', {
        sessionCode: session.code,
        players: session.players,
      });
    } catch (error) {
      console.error(error);
      client.emit('error', { message: 'Failed to create session' });
    }
  }

  @SubscribeMessage('getSession')
  async handleGetSessions(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionCode: string },
  ) {
    const sessionData = await this.sessionService.getSession(data.sessionCode);

    if (!sessionData) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
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
    console.log('playerJoined', {
      sessionCode: data.sessionCode,
      players: session.players,
    });

    return { success: true };
  }

  @SubscribeMessage('leaveSession')
  async handleLeave(
    @MessageBody() data: { sessionCode: string; player: string },
    @ConnectedSocket() client: Socket,
  ) {
    //TODO - HANDLE WITH CLIENT (REMOVE OPERATOR ON SESSION LEAVE)
    // Supprime le joueur de la session dans Redis
    const session = await this.sessionService.removePlayerFromSession(
      data.sessionCode,
      client.id,
    );
    if (!session) {
      return {
        success: false,
        message: `Session with code ${data.sessionCode} does not exist`,
      };
    }

    // Le client quitte la salle correspondant à la session
    await client.leave(data.sessionCode);

    // Informe tous les clients de la salle que le joueur a quitté
    this.server.to(data.sessionCode).emit('playerLeft', {
      playerId: client.id,
      session,
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
    console.log('gameStarted', {
      sessionCode: data.sessionCode,
      players: updatedSession.players,
      operators: recipients,
      solutionsDistribution: solutionsDistribution.map((d) => ({
        moduleId: d.moduleId,
        allocations: d.allocations,
      })),
    });
    console.log(
      'solutionsDistributionRaw',
      JSON.stringify(solutionsDistribution, null, 2),
    );

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
      console.log('error', error);
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

  startGameTimer(sessionCode: string, session: Session) {
    let remaining = session.maxTime;

    this.server.to(sessionCode).emit('timerUpdate', { remaining });

    const tick = async () => {
      remaining -= 1;
      console.log('Remaining time:', remaining, ' for session : ', sessionCode);

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
}

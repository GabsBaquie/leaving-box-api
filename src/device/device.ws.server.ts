import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { SessionService } from 'src/session/session.service';
import { DeviceService } from './device.service';

type DeviceMessage =
  | { type: 'hello'; sessionCode: string }
  | { type: 'poll'; sessionCode?: string }
  | { type: 'status'; sessionCode: string; gameId: number; status: string; strikes?: number };

@Injectable()
export class DeviceWsServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceWsServer.name);
  private server: WebSocketServer | null = null;
  private readonly clients = new Map<WebSocket, string>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly deviceService: DeviceService,
  ) {}

  onModuleInit() {
    const port = Number(process.env.DEVICE_WS_PORT) || 3100;
    this.server = new WebSocketServer({ port });
    this.server.on('connection', (socket) => this.handleConnection(socket));
    this.logger.log(`Device WS listening on :${port}`);
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleConnection(socket: WebSocket) {
    const remote = (socket as any)?._socket?.remoteAddress || 'unknown';
    this.logger.log(`Device connected from ${remote}`);
    socket.on('message', (data) => this.handleMessage(socket, data.toString()));
    socket.on('close', () => {
      this.logger.log('Device disconnected');
      this.clients.delete(socket);
    });
  }

  private async handleMessage(socket: WebSocket, raw: string) {
    let payload: DeviceMessage;
    try {
      payload = JSON.parse(raw) as DeviceMessage;
    } catch (error) {
      this.logger.warn(`Invalid JSON: ${raw}`);
      this.send(socket, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if (payload.type === 'hello') {
      this.logger.log(`HELLO ${payload.sessionCode}`);
      await this.handleHello(socket, payload.sessionCode);
      return;
    }

    if (payload.type === 'poll') {
      this.logger.log(`POLL ${payload.sessionCode || this.clients.get(socket)}`);
      const sessionCode = payload.sessionCode || this.clients.get(socket);
      if (sessionCode) {
        await this.sendState(socket, sessionCode);
      } else {
        this.send(socket, { type: 'error', message: 'Missing sessionCode' });
      }
      return;
    }

    if (payload.type === 'status') {
      this.logger.log(
        `STATUS ${payload.sessionCode} game=${payload.gameId} status=${payload.status}`,
      );
      await this.handleStatus(socket, payload);
      return;
    }

    this.send(socket, { type: 'error', message: 'Unknown message type' });
  }

  private async handleHello(socket: WebSocket, sessionCode: string) {
    const normalized = (sessionCode || '').trim().toUpperCase();
    if (!normalized) {
      this.send(socket, { type: 'error', message: 'Missing sessionCode' });
      return;
    }

    const session = await this.sessionService.getSession(normalized);
    if (!session) {
      this.logger.warn(`Unknown session code ${normalized}`);
      this.send(socket, {
        type: 'error',
        message: `Unknown session code ${normalized}`,
      });
      return;
    }

    this.clients.set(socket, normalized);
    await this.deviceService.getOrCreateState(normalized);
    this.logger.log(`Device bound to session ${normalized}`);
    this.send(socket, { type: 'ack', sessionCode: normalized });
    await this.sendState(socket, normalized);
  }

  private async handleStatus(socket: WebSocket, payload: DeviceMessage) {
    if (payload.type !== 'status') {
      return;
    }
    const normalized = (payload.sessionCode || '').trim().toUpperCase();
    if (!normalized) {
      this.send(socket, { type: 'error', message: 'Missing sessionCode' });
      return;
    }

    await this.deviceService.applyStatus(
      normalized,
      payload.status,
      payload.strikes,
    );

    this.logger.log(`Status stored for session ${normalized}`);
    this.send(socket, { type: 'statusAck', sessionCode: normalized });
  }

  private async sendState(socket: WebSocket, sessionCode: string) {
    const session = await this.sessionService.getSession(sessionCode);
    if (!session) {
      this.logger.warn(`Session expired ${sessionCode}`);
      this.send(socket, { type: 'error', message: 'Session expired' });
      return;
    }

    const device = await this.deviceService.getOrCreateState(sessionCode);
    this.logger.log(
      `State -> device ${sessionCode} time=${session.remainingTime} strikes=${device.strikes}`,
    );
    this.send(socket, {
      type: 'state',
      sessionCode,
      barcode: device.barcode,
      ram: device.ram,
      strikes: device.strikes,
      timeLeft: session.remainingTime,
      started: session.started,
    });
  }

  private send(socket: WebSocket, payload: object) {
    try {
      socket.send(JSON.stringify(payload));
    } catch (error) {
      this.logger.warn('Failed to send message to device.');
    }
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'net';
import { SessionService } from 'src/session/session.service';
import { DeviceService } from './device.service';

type DeviceMessage =
  | { type: 'hello'; sessionCode: string }
  | { type: 'poll'; sessionCode?: string }
  | { type: 'status'; sessionCode: string; gameId: number; status: string; strikes?: number };

@Injectable()
export class DeviceTcpServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceTcpServer.name);
  private server: Server | null = null;
  private readonly clients = new Map<Socket, string>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly deviceService: DeviceService,
  ) {}

  onModuleInit() {
    const port = Number(process.env.DEVICE_TCP_PORT) || 3200;
    const host = process.env.DEVICE_TCP_HOST || '0.0.0.0';
    this.server = new Server((socket) => this.handleConnection(socket));
    this.server.listen(port, host, () => {
      this.logger.log(`Device TCP listening on ${host}:${port}`);
    });
    this.server.on('error', (error) => {
      this.logger.error(`TCP server error: ${error.message}`);
    });
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleConnection(socket: Socket) {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`Device TCP connected from ${remote}`);
    socket.setEncoding('utf8');
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          this.handleMessage(socket, line);
        }
        index = buffer.indexOf('\n');
      }
    });

    socket.on('close', () => {
      this.logger.log('Device TCP disconnected');
      this.clients.delete(socket);
    });

    socket.on('error', (error) => {
      this.logger.warn(`Device TCP socket error: ${error.message}`);
    });
  }

  private async handleMessage(socket: Socket, raw: string) {
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

  private async handleHello(socket: Socket, sessionCode: string) {
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

  private async handleStatus(socket: Socket, payload: DeviceMessage) {
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

  private async sendState(socket: Socket, sessionCode: string) {
    const session = await this.sessionService.getSession(sessionCode);
    if (!session) {
      this.logger.warn(`Session expired ${sessionCode}`);
      this.send(socket, { type: 'error', message: 'Session expired' });
      return;
    }

    const device = await this.deviceService.getOrCreateState(sessionCode);
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

  private send(socket: Socket, payload: object) {
    try {
      socket.write(`${JSON.stringify(payload)}\n`);
    } catch (error) {
      this.logger.warn('Failed to send message to device.');
    }
  }
}

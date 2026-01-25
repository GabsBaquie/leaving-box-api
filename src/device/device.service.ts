import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/session/redis/redis.service';
import { DeviceState } from './device.interface';

const DEVICE_PREFIX = 'device';
const BARCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(private readonly redisService: RedisService) {}

  async getState(sessionCode: string): Promise<DeviceState | null> {
    const payload = await this.redisService.get(
      `${DEVICE_PREFIX}:${sessionCode}`,
    );
    return payload ? (JSON.parse(payload) as DeviceState) : null;
  }

  async getOrCreateState(sessionCode: string): Promise<DeviceState> {
    const existing = await this.getState(sessionCode);
    if (existing) {
      return existing;
    }

    const state: DeviceState = {
      sessionCode,
      barcode: this.generateBarcode(11),
      ram: this.randomRam(),
      strikes: 0,
      updatedAt: new Date().toISOString(),
    };

    await this.saveState(sessionCode, state);
    this.logger.log(`Created device state for ${sessionCode}`);
    return state;
  }

  async updateState(
    sessionCode: string,
    partial: Partial<DeviceState>,
  ): Promise<DeviceState> {
    const current = await this.getOrCreateState(sessionCode);
    const updated: DeviceState = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    await this.saveState(sessionCode, updated);
    this.logger.log(`Updated device state for ${sessionCode}`);
    return updated;
  }

  async applyStatus(
    sessionCode: string,
    status?: string,
    strikes?: number,
  ): Promise<DeviceState> {
    const current = await this.getOrCreateState(sessionCode);
    const nextStrikes =
      typeof strikes === 'number'
        ? strikes
        : status === 'strike'
          ? current.strikes + 1
          : current.strikes;

    this.logger.log(
      `Apply status for ${sessionCode} status=${status} strikes=${nextStrikes}`,
    );
    return this.updateState(sessionCode, {
      strikes: nextStrikes,
      lastStatus: status,
    });
  }

  private async saveState(
    sessionCode: string,
    state: DeviceState,
  ): Promise<void> {
    await this.redisService.set(
      `${DEVICE_PREFIX}:${sessionCode}`,
      JSON.stringify(state),
    );
  }

  private randomRam(): number {
    return Math.floor(Math.random() * 4) + 1;
  }

  private generateBarcode(length: number): string {
    let result = '';
    for (let index = 0; index < length; index++) {
      const pick = Math.floor(Math.random() * BARCODE_ALPHABET.length);
      result += BARCODE_ALPHABET[pick];
    }
    return result;
  }
}

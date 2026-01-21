// redis.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
    this.client.on('error', (err) => {
      this.logger.error('Redis error', process.env.REDIS_HOST, err);
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });
  }

  async getAll(key: string): Promise<string[]> {
    console.log(key);

    const keys = await this.client.keys(`${key}:*`);
    return keys;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<string> {
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }
}

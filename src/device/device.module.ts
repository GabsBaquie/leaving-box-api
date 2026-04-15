import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceWsServer } from './device.ws.server';
import { DeviceTcpServer } from './device.tcp.server';
import { RedisModule } from 'src/session/redis/redis.module';
import { SessionsModule } from 'src/session/session.module';

@Module({
  imports: [RedisModule, SessionsModule],
  providers: [DeviceService, DeviceWsServer, DeviceTcpServer],
  exports: [DeviceService],
})
export class DeviceModule {}

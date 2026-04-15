import { Module, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionsModule } from './session/session.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './session/redis/redis.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ModuleModule } from './game/modules/module.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? './environment/.env.prod'
          : './environment/.env.dev',
    }),
    MongooseModule.forRoot(process.env.DATABASE_URL as string, {
      connectionFactory: (connection) => {
        const logger = new Logger('MongoDB');
        if (connection.readyState === 1) {
          logger.log('✅ Connecté à MongoDB');
          logger.log(
            `📊 Base de données: ${connection.db?.databaseName || 'N/A'}`,
          );
        } else {
          logger.warn('⚠️ État de connexion MongoDB:', connection.readyState);
        }
        connection.on('connected', () => {
          logger.log('✅ MongoDB connecté');
        });
        connection.on('error', (error) => {
          logger.error('❌ Erreur MongoDB:', error);
        });
        connection.on('disconnected', () => {
          logger.warn('⚠️ MongoDB déconnecté');
        });
        return connection;
      },
    }),
    ModuleModule,
    SessionsModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

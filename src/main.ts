import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    '/manuals',
    express.static(join(__dirname, '..', 'public', 'manuals')),
  );

  const config = new DocumentBuilder()
    .setTitle('Leaving Box API')
    .setDescription('API FOR LEAVING BOX')
    .setVersion('0.1')
    .addTag('Sessions')
    .addTag('Modules')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();

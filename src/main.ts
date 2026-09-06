import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Preserve the exact request bytes so signed provider callbacks can be
  // verified before JSON parsing/serialization changes the payload.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Let Nest and BullMQ close listeners/Redis handles during rolling deploys.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // ERP frontend owns port 3000 and ERP API owns 3001 in local development.
  // Keep the standalone notification platform on its dedicated default port.
  await app.listen(Number(process.env.PORT ?? 3002));
}

void bootstrap();

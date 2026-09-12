import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let isAppInitialized = false;

async function bootstrapServer(): Promise<express.Express> {
  if (!isAppInitialized) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { rawBody: true });
    app.enableShutdownHooks();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    isAppInitialized = true;
  }
  return server;
}

export default async function handler(req: Request, res: Response) {
  await bootstrapServer();
  server(req, res);
}

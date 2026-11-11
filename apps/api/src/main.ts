import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './config';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '2mb' }));
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('Bootstrap').log(`NEXBILL API listening on :${config.port} (docs at /api/docs)`);
}
void main();

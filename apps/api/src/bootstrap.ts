import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './config';
import { requestLogger } from './common/http';

/** Shared by main.ts and the integration tests so both run the exact same HTTP stack. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestLogger);
  app.enableCors({ origin: config.webOrigin, credentials: true, allowedHeaders: ['content-type', 'authorization', 'x-business-id', 'x-nexbill-csrf', 'x-request-id'] });
  (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', 1);
  const doc = new DocumentBuilder().setTitle('NEXBILL API').setDescription('Billing, POS, inventory and GST for Indian retail').setVersion('0.1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
}

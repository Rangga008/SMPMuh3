import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvService } from './core/config/env.service';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter';
import { ResponseInterceptor } from './core/http/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // needed for payment webhook signature verification
  });
  const env = app.get(EnvService);

  app.useLogger(app.get(Logger));

  app.use(helmet());
  // Mesin absensi (protokol iClock/ADMS) me-POST teks polos/tab-separated —
  // buffer manual jadi string untuk path /iclock, tanpa mengganggu parser JSON.
  app.use('/api/v1/iclock', (req: Request, _res: Response, next: NextFunction) => {
    if (req.method !== 'POST' || req.body !== undefined) return next();
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      (req as { body: unknown }).body = chunks.length
        ? Buffer.concat(chunks).toString('utf8')
        : '';
      next();
    });
    req.on('error', () => next());
  });
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(env.apiPort);
}

bootstrap();

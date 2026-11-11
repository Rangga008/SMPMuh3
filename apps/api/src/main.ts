import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvService } from './core/config/env.service';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter';
import { ResponseInterceptor } from './core/http/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // needed for payment webhook signature verification
  });
  const env = app.get(EnvService);

  // Di belakang reverse proxy (Caddy/Nginx): percaya X-Forwarded-For satu hop
  // agar req.ip = IP klien asli. Tanpa ini ThrottlerGuard menghitung semua
  // request sebagai satu klien (IP proxy) dan membatasi seluruh traffic.
  app.set('trust proxy', 1);

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

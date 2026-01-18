import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get underlying HTTP framework instance (Express by default).
  // This is where .set() / .disable() live.
  const instance: any = app.getHttpAdapter().getInstance?.();

  // In production behind a proxy (Vercel/Koyeb), this improves correct IP handling.
  if (instance?.set) instance.set('trust proxy', 1);
  if (instance?.disable) instance.disable('x-powered-by');

  // Basic security headers (low overhead).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Enable gzip compression for JSON.
  app.use(compression());

  app.setGlobalPrefix('api');

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const frontendOrigin = process.env.FRONTEND_ORIGIN; // e.g. https://xxx.vercel.app

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (frontendOrigin && origin === frontendOrigin) return cb(null, true);

      try {
        const host = new URL(origin).hostname;
        if (host.endsWith('.vercel.app')) return cb(null, true);
      } catch {}

      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend running on ${port}`);
}

bootstrap();

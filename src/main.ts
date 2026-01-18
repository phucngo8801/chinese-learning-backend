import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API prefix
  app.setGlobalPrefix('api');

  // Serve uploaded files
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  /**
   * CORS
   * - Allow:
   *   - FRONTEND_ORIGIN (prod domain)
   *   - localhost dev
   *   - all *.vercel.app (preview deployments)
   *
   * NOTE:
   * - Postman/curl may not send Origin => allow.
   */
  const allowlist = [
    process.env.FRONTEND_ORIGIN, // ex: https://chinese-learning-frontend.vercel.app
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, cb) => {
      // No origin => allow (Postman/curl/server-to-server)
      if (!origin) return cb(null, true);

      // Allow any Vercel preview domain
      if (origin.endsWith('.vercel.app')) return cb(null, true);

      // Allow configured origins
      if (allowlist.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Listen
  const port = Number(process.env.PORT) || 8000; // Koyeb thường dùng PORT, fallback 8000
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend running at http://0.0.0.0:${port}`);
}

bootstrap();

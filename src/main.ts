import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Serve uploaded files
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  /**
   * CORS:
   * - DEV: origin:true (reflect origin) để tiện test
   * - PROD: nên set cụ thể FRONTEND_ORIGIN để an toàn
   */
  const frontendOrigin = process.env.FRONTEND_ORIGIN; // ví dụ: https://your-fe.pages.dev

  app.enableCors({
    origin: frontendOrigin ? [frontendOrigin] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend running at http://localhost:${port}`);
}

bootstrap();

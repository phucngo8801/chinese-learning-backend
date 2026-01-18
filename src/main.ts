import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const frontendOrigin = process.env.FRONTEND_ORIGIN; // ví dụ: https://chinese-learning-frontend.vercel.app

  app.enableCors({
    origin: (origin, cb) => {
      // requests không có origin (curl/postman) -> cho qua
      if (!origin) return cb(null, true);

      // nếu bạn set FRONTEND_ORIGIN cố định -> chỉ cho phép đúng origin đó
      if (frontendOrigin && origin === frontendOrigin) return cb(null, true);

      // cho phép mọi preview vercel.app (tùy bạn)
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

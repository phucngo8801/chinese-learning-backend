// src/modules/lessons/lessons.controller.ts
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  findAll() {
    return this.lessonsService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: {
    hskLevel: number;
    vi: string;
    zh: string;
    pinyin: string;
  }) {
    return this.lessonsService.create(body);
  }
}

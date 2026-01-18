// src/modules/lessons/lessons.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  findAll() {
    return this.lessonsService.findAll();
  }

  @Post()
  create(@Body() body: {
    hskLevel: number;
    vi: string;
    zh: string;
    pinyin: string;
  }) {
    return this.lessonsService.create(body);
  }
}

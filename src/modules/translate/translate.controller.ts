import { Controller, Post, Body } from '@nestjs/common';
import { TranslateService } from './translate.service';

@Controller('translate')
export class TranslateController {
  constructor(private readonly service: TranslateService) {}

  @Post()
  async translate(@Body('text') text: string) {
    return this.service.translateViToZh(text);
  }
}

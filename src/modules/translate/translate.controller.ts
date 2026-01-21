import { Controller, Post, Body, Req } from '@nestjs/common';
import { TranslateService } from './translate.service';

@Controller('translate')
export class TranslateController {
  constructor(private readonly service: TranslateService) {}

  @Post()
  async translate(@Body('text') text: string, @Req() req: any) {
    const ip = req?.ip as string | undefined;
    const authHeader = req?.headers?.authorization as string | undefined;

    return this.service.translateViToZh(text, { ip, authHeader });
  }
}

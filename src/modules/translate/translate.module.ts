import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';

@Module({
  controllers: [TranslateController],
  providers: [TranslateService], // 👈 BẮT BUỘC
})
export class TranslateModule {}

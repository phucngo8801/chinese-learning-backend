import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { SharedAuthModule } from '../../shared/auth/auth.module';

@Module({
  imports: [UsersModule, SharedAuthModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

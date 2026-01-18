import 'dotenv/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev_jwt_secret',
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // ✅ Chuẩn duy nhất toàn project: req.user.id
    if (!payload?.sub) throw new UnauthorizedException('Invalid token');

    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}

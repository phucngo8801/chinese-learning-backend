import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(identifier: string, password: string, name: string) {
    if (!name || name.trim() === '') {
      throw new BadRequestException('Name is required');
    }

    const existing = await this.usersService.findByEmail(identifier);
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      email: identifier,
      password: hashedPassword,
      name,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async login(identifier: string, password: string) {
    const user = await this.usersService.findByEmail(identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload = { sub: user.id, email: user.email };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}

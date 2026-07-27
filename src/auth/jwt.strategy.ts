import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../shared/redis/redis.service';
import { JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(RedisService) private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const sessionKey = `session:${payload.sub}`;
    const storedToken = await this.redis.getClient().get(sessionKey);
    if (!storedToken || storedToken !== token) {
      throw new UnauthorizedException('Session no longer active');
    }
    return { id: payload.sub, phone: payload.phone };
  }
}

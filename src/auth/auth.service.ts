import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ulid } from 'ulid';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';
import { OtpService } from './otp.service';
import { RateLimitService } from './rate-limit.service';
import { RegisterDto, VerifyDto, AuthResponse, JwtPayload } from './auth.types';

const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET ?? 'refresh-secret';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RedisService) private redis: RedisService,
    @Inject(OtpService) private otp: OtpService,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(RateLimitService) private rateLimit: RateLimitService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    await this.otp.generate(dto.phone);
  }

  async verify(dto: VerifyDto): Promise<AuthResponse> {
    const valid = await this.otp.verify(dto.phone, dto.otp);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    let user = await this.db.getPool().query(
      'SELECT id, phone, display_name FROM users WHERE phone = $1', [dto.phone],
    );

    if (user.rows.length === 0) {
      const id = ulid();
      await this.db.getPool().query(
        'INSERT INTO users (id, phone) VALUES ($1, $2)',
        [id, dto.phone],
      );
      user = await this.db.getPool().query(
        'SELECT id, phone, display_name FROM users WHERE id = $1', [id],
      );
    }

    await this.otp.consume(dto.phone);

    const payload: JwtPayload = { sub: user.rows[0].id, phone: dto.phone };

    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, {
      secret: REFRESH_SECRET(),
      expiresIn: '7d',
    });

    const sessionKey = `session:${user.rows[0].id}`;
    await this.redis.getClient().set(sessionKey, accessToken, 'EX', 7 * 86400);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.rows[0].id,
        phone: user.rows[0].phone,
        displayName: user.rows[0].display_name ?? null,
      },
    };
  }

  async refresh(token: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, { secret: REFRESH_SECRET() });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const allowed = await this.rateLimit.check(`refresh:${payload.sub}`, 5, 60);
    if (!allowed) {
      throw new UnauthorizedException('Too many attempts');
    }

    const stored = await this.redis.getClient().get(`refresh:${payload.sub}`);
    if (!stored || stored !== token) {
      throw new UnauthorizedException('Refresh token no longer active');
    }

    const result = await this.db.getPool().query(
      'SELECT id, phone, display_name FROM users WHERE id = $1', [payload.sub],
    );
    if (result.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const newPayload: JwtPayload = { sub: payload.sub, phone: payload.phone };
    const newAccessToken = this.jwt.sign(newPayload, { expiresIn: '15m' });
    const newRefreshToken = this.jwt.sign(newPayload, {
      secret: REFRESH_SECRET(),
      expiresIn: '7d',
    });

    await this.redis.getClient().set(`session:${payload.sub}`, newAccessToken, 'EX', 7 * 86400);
    await this.redis.getClient().set(`refresh:${payload.sub}`, newRefreshToken, 'EX', 7 * 86400);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: result.rows[0].id,
        phone: result.rows[0].phone,
        displayName: result.rows[0].display_name ?? null,
      },
    };
  }
}

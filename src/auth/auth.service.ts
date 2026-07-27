import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ulid } from 'ulid';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';
import { OtpService } from './otp.service';
import { RegisterDto, VerifyDto, AuthResponse, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RedisService) private redis: RedisService,
    @Inject(OtpService) private otp: OtpService,
    @Inject(JwtService) private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const existing = await this.db.getPool().query(
      'SELECT id FROM users WHERE phone = $1', [dto.phone],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException('Phone already registered');
    }
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

    const payload: JwtPayload = { sub: user.rows[0].id, phone: dto.phone };

    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
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
}

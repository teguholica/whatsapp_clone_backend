import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { RateLimitService } from './rate-limit.service';
import { JwtStrategy } from './jwt.strategy';
import { DatabaseModule } from '../shared/database/database.module';
import { RedisModule } from '../shared/redis/redis.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, RateLimitService, JwtStrategy],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}

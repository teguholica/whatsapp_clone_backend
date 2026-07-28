import { Controller, Post, Body, HttpCode, HttpStatus, Inject, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RateLimitService } from './rate-limit.service';
import { RegisterDto, VerifyDto, RefreshDto } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(RateLimitService) private rateLimit: RateLimitService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { message: 'OTP sent' };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyDto) {
    const allowed = await this.rateLimit.check(
      `verify:${dto.phone}`, 5, 60,
    );
    if (!allowed) {
      throw new HttpException('Too many attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.auth.verify(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { RedisService } from '../shared/redis/redis.service';

export interface OtpProvider {
  generate(phone: string): Promise<string>;
  verify(phone: string, code: string): Promise<boolean>;
  consume(phone: string): Promise<void>;
}

@Injectable()
export class OtpService implements OtpProvider {
  private readonly ttl = 300;

  constructor(@Inject(RedisService) private redis: RedisService) {}

  async generate(phone: string): Promise<string> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = `otp:${phone}`;
    await this.redis.getClient().set(key, code, 'EX', this.ttl);
    console.log(`[OTP] ${phone}: ${code}`);
    return code;
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const key = `otp:${phone}`;
    const stored = await this.redis.getClient().get(key);
    if (!stored || stored !== code) return false;
    return true;
  }

  async consume(phone: string): Promise<void> {
    await this.redis.getClient().del(`otp:${phone}`);
  }
}

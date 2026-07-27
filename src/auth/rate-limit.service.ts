import { Injectable, Inject } from '@nestjs/common';
import { RedisService } from '../shared/redis/redis.service';

@Injectable()
export class RateLimitService {
  constructor(@Inject(RedisService) private redis: RedisService) {}

  async check(key: string, maxAttempts: number, windowSec: number): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const current = await this.redis.getClient().incr(redisKey);
    if (current === 1) {
      await this.redis.getClient().expire(redisKey, windowSec);
    }
    return current <= maxAttempts;
  }
}

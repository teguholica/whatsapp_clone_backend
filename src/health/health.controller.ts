import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const dbHealthy = await this.db.isHealthy();
    const redisHealthy = await this.redis.isHealthy();
    const status = dbHealthy && redisHealthy ? 'ok' : 'degraded';
    return {
      status,
      db: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    };
  }
}

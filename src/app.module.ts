import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule],
})
export class AppModule {}

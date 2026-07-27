import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule, AuthModule],
})
export class AppModule {}

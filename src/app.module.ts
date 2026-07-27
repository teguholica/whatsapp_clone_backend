import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './message/message.module';
import { WsModule } from './ws/ws.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule, AuthModule, UserModule, ConversationModule, MessageModule, WsModule],
})
export class AppModule {}

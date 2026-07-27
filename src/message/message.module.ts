import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [AuthModule, WsModule],
  controllers: [MessageController],
  providers: [MessageService],
})
export class MessageModule {}

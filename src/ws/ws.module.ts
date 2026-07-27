import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsRoomManager } from './ws-room-manager';

@Module({
  providers: [WsGateway, WsRoomManager],
  exports: [WsRoomManager],
})
export class WsModule {}

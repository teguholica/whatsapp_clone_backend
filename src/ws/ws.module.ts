import { Global, Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsRoomManager } from './ws-room-manager';

@Global()
@Module({
  providers: [WsGateway, WsRoomManager],
  exports: [WsGateway, WsRoomManager],
})
export class WsModule {}

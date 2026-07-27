import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import * as url from 'url';
import { RedisService } from '../shared/redis/redis.service';
import { WsRoomManager } from './ws-room-manager';
import * as jwt from 'jsonwebtoken';

interface AuthUser {
  id: string;
  phone: string;
}

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private connections = new Map<WebSocket, AuthUser>();

  constructor(
    @Inject(RedisService) private redis: RedisService,
    @Inject(WsRoomManager) public rooms: WsRoomManager,
  ) {}

  async handleConnection(client: WebSocket, req: any): Promise<void> {
    const token = this.extractToken(req);
    if (!token) {
      client.close(4001, 'Authentication required');
      return;
    }

    const user = await this.validateToken(token);
    if (!user) {
      client.close(4001, 'Invalid or expired token');
      return;
    }

    const sessionKey = `session:${user.id}`;
    const storedToken = await this.redis.getClient().get(sessionKey);
    if (!storedToken || storedToken !== token) {
      client.close(4001, 'Session no longer active');
      return;
    }

    this.connections.set(client, user);
    (client as any).__userId = user.id;
  }

  handleDisconnect(client: WebSocket): void {
    this.rooms.leaveAll(client);
    this.connections.delete(client);
  }

  @SubscribeMessage('room:join')
  handleRoomJoin(client: WebSocket, payload: any): void {
    const user = this.connections.get(client);
    if (!user) return;
    const data = typeof payload === 'object' ? payload : this.tryParse(payload);
    if (data?.conversationId) {
      this.rooms.join(client, data.conversationId);
    }
  }

  @SubscribeMessage('room:leave')
  handleRoomLeave(client: WebSocket, payload: any): void {
    const user = this.connections.get(client);
    if (!user) return;
    const data = typeof payload === 'object' ? payload : this.tryParse(payload);
    if (data?.conversationId) {
      this.rooms.leave(client, data.conversationId);
    }
  }

  private extractToken(req: any): string | null {
    const query = url.parse(req.url ?? '', true).query;
    if (query.token) return query.token as string;
    return null;
  }

  private async validateToken(token: string): Promise<AuthUser | null> {
    try {
      const secret = process.env.JWT_SECRET ?? 'dev-secret';
      const decoded: any = jwt.verify(token, secret);
      return { id: decoded.sub, phone: decoded.phone };
    } catch {
      return null;
    }
  }

  private tryParse(data: any): any {
    try { return JSON.parse(data); } catch { return null; }
  }
}

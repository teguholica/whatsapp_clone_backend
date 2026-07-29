import { Inject } from '@nestjs/common';
import * as http from 'http';
import { Server as WsServer, WebSocket } from 'ws';
import * as url from 'url';
import { RedisService } from '../shared/redis/redis.service';
import { DatabaseService } from '../shared/database/database.service';
import { WsRoomManager } from './ws-room-manager';
import * as jwt from 'jsonwebtoken';

interface AuthUser {
  id: string;
  phone: string;
}

export class WsGateway {
  private wss!: WsServer;
  private connections = new Map<WebSocket, AuthUser>();
  private typingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(RedisService) private redis: RedisService,
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(WsRoomManager) public rooms: WsRoomManager,
  ) {}

  attach(httpServer: http.Server): void {
    this.wss = new WsServer({ server: httpServer });
    console.log('[WS] Raw WebSocket server attached');

    this.wss.on('connection', (client: WebSocket, req: any) => {
      const token = this.extractToken(req);
      if (!token) {
        client.close(4001, 'Authentication required');
        return;
      }

      const pendingMessages: any[] = [];

      client.on('message', (raw: Buffer) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg.event) return;
        if (!(client as any).__userId) {
          pendingMessages.push(msg);
          return;
        }
        this.handleWsMessage(client, msg);
      });
      client.on('close', () => this.handleClose(client));

      this.authenticate(client, token, pendingMessages);
    });
  }

  private async authenticate(client: WebSocket, token: string, pendingMessages: any[]): Promise<void> {
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

    for (const msg of pendingMessages) {
      this.handleWsMessage(client, msg);
    }
  }

  private handleWsMessage(client: WebSocket, msg: any): void {
    switch (msg.event) {
      case 'room:join': {
        const roomUser = this.connections.get(client);
        const roomData = msg.data || {};
        if (!roomUser || !roomData.conversationId) break;
        this.rooms.join(client, roomData.conversationId);
        this.deliverPending(client, roomData.conversationId, roomUser.id);
        break;
      }
      case 'room:leave': {
        const leaveData = msg.data || {};
        if (leaveData.conversationId) this.rooms.leave(client, leaveData.conversationId);
        break;
      }
      case 'message:read': {
        const readUser = this.connections.get(client);
        const readData = msg.data || {};
        if (readUser && readData.messageId) this.markRead(readData.messageId, readUser.id);
        break;
      }
      case 'typing:start':
      case 'typing:stop': {
        const typingUser = this.connections.get(client);
        const typingData = msg.data || {};
        if (typingUser && typingData.conversationId) {
          this.handleTyping(client, typingUser, msg.event, typingData.conversationId);
        }
        break;
      }
      case 'presence:online': {
        const presenceUser = this.connections.get(client);
        if (presenceUser) {
          this.broadcastToAll('presence', { userId: presenceUser.id, status: 'online' }, presenceUser.id);
        }
        break;
      }
    }
  }

  private async handleClose(client: WebSocket): Promise<void> {
    const user = this.connections.get(client);
    this.rooms.leaveAll(client);
    this.connections.delete(client);
    if (user) {
      await this.db.getPool().query(
        'UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id],
      );
      this.broadcastToAll('presence', {
        userId: user.id,
        status: 'offline',
        lastSeenAt: new Date().toISOString(),
      });
      for (const [key, timeout] of this.typingTimeouts) {
        if (key.endsWith(`:${user.id}`)) {
          clearTimeout(timeout);
          this.typingTimeouts.delete(key);
        }
      }
    }
  }

  private async handleTyping(client: WebSocket, user: AuthUser, event: string, conversationId: string): Promise<void> {
    const key = `${conversationId}:${user.id}`;
    if (event === 'typing:stop') {
      const existing = this.typingTimeouts.get(key);
      if (existing) { clearTimeout(existing); this.typingTimeouts.delete(key); }
      this.broadcastToRoom(conversationId, 'typing:stop', { conversationId, userId: user.id }, user.id);
      return;
    }

    const convType = await this.getConversationType(conversationId);
    const includeUserId = convType !== 'group';
    this.broadcastToRoom(conversationId, 'typing', {
      conversationId,
      ...(includeUserId ? { userId: user.id } : {}),
    }, user.id);

    const existing = this.typingTimeouts.get(key);
    if (existing) clearTimeout(existing);
    this.typingTimeouts.set(key, setTimeout(() => {
      this.broadcastToRoom(conversationId, 'typing:stop', { conversationId, userId: user.id }, user.id);
      this.typingTimeouts.delete(key);
    }, 5000));
  }

  private async getConversationType(conversationId: string): Promise<string | null> {
    try {
      const result = await this.db.getPool().query(
        'SELECT type FROM conversations WHERE id = $1', [conversationId],
      );
      return result.rows[0]?.type ?? null;
    } catch { return null; }
  }

  private broadcastToAll(event: string, data: any, excludeUserId?: string): void {
    const message = JSON.stringify({ event, data });
    for (const [client, user] of this.connections) {
      if (user.id === excludeUserId) continue;
      if (client.readyState === 1) client.send(message);
    }
  }

  private async deliverPending(client: WebSocket, conversationId: string, userId: string): Promise<void> {
    const pending = await this.db.getPool().query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.created_at
       FROM messages m
       JOIN message_status ms ON ms.message_id = m.id
       WHERE m.conversation_id = $1 AND ms.user_id = $2 AND ms.status = 'sent'`,
      [conversationId, userId],
    );
    if (pending.rows.length === 0) return;
    for (const row of pending.rows) {
      const parsed = {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        type: row.type,
        content: row.content,
        createdAt: row.created_at,
      };
      if (client.readyState === 1) {
        client.send(JSON.stringify({ event: 'message:new', data: parsed }));
      }
      await this.db.getPool().query(
        `UPDATE message_status SET status = 'delivered', updated_at = NOW()
         WHERE message_id = $1 AND user_id = $2 AND status = 'sent'`,
        [row.id, userId],
      );
      this.broadcastToRoom(conversationId, 'message:status', {
        messageId: row.id, userId, status: 'delivered',
      }, userId);
    }
  }

  broadcastToRoom(conversationId: string, event: string, data: any, excludeUserId?: string): string[] {
    const message = JSON.stringify({ event, data });
    const roomsMap = this.rooms['rooms'] as Map<string, Set<WebSocket>>;
    console.log(`[WS] broadcastToRoom: ${event} to ${conversationId}, rooms: ${roomsMap ? roomsMap.size : 0}`);
    const clients = roomsMap?.get(conversationId);
    if (!clients || clients.size === 0) {
      console.log(`[WS] No clients in room ${conversationId} (total rooms: ${roomsMap?.size || 0})`);
      return [];
    }
    console.log(`[WS] Broadcasting to ${clients.size} clients in room ${conversationId}`);
    const deliveredTo: string[] = [];
    for (const client of clients) {
      const userId = (client as any).__userId as string | undefined;
      if (userId && userId === excludeUserId) continue;
      if (client.readyState === 1) {
        client.send(message);
        console.log(`[WS] Sent ${event} to ${userId}`);
        if (userId) deliveredTo.push(userId);
      } else {
        console.log(`[WS] Client ${userId} not ready (state: ${client.readyState})`);
      }
    }
    return deliveredTo;
  }

  async markRead(messageId: string, userId: string): Promise<void> {
    const msg = await this.db.getPool().query(
      'SELECT conversation_id, sender_id FROM messages WHERE id = $1', [messageId],
    );
    if (msg.rows.length === 0) return;

    const conv = await this.db.getPool().query(
      'SELECT type FROM conversations WHERE id = $1', [msg.rows[0].conversation_id],
    );
    if (conv.rows.length === 0) return;
    if (conv.rows[0].type !== 'individual') return;

    await this.db.getPool().query(
      `INSERT INTO message_status (message_id, user_id, status, updated_at)
       VALUES ($1, $2, 'read', NOW())
       ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
      [messageId, userId],
    );

    this.broadcastToRoom(msg.rows[0].conversation_id, 'message:status', {
      messageId, userId, status: 'read',
    });
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


}

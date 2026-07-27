import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { ulid } from 'ulid';
import { DatabaseService } from '../shared/database/database.service';
import { WsGateway } from '../ws/ws.gateway';
import { MessageResponse } from './message.types';

@Injectable()
export class MessageService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(WsGateway) private ws: WsGateway,
  ) {}

  async send(conversationId: string, senderId: string, content: string): Promise<MessageResponse> {
    const conv = await this.db.getPool().query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
       WHERE c.id = $2`,
      [senderId, conversationId],
    );
    if (conv.rows.length === 0) throw new ForbiddenException('Not a member of this conversation');

    const id = ulid();
    await this.db.getPool().query(
      `INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1, $2, $3, 'text', $4)`,
      [id, conversationId, senderId, content],
    );

    const members = await this.db.getPool().query(
      `SELECT user_id FROM conversation_members
       WHERE conversation_id = $1 AND user_id != $2 AND left_at IS NULL`,
      [conversationId, senderId],
    );

    for (const member of members.rows) {
      await this.db.getPool().query(
        `INSERT INTO message_status (message_id, user_id, status, updated_at)
         VALUES ($1, $2, 'sent', NOW())`,
        [id, member.user_id],
      );
    }

    const msg = await this.getById(id);
    const deliveredTo = this.ws.broadcastToRoom(conversationId, 'message:new', msg, senderId);

    if (deliveredTo.length > 0) {
      for (const userId of deliveredTo) {
        await this.db.getPool().query(
          `UPDATE message_status SET status = 'delivered', updated_at = NOW()
           WHERE message_id = $1 AND user_id = $2 AND status = 'sent'`,
          [id, userId],
        );
        this.ws.broadcastToRoom(conversationId, 'message:status', {
          messageId: id, userId, status: 'delivered',
        }, senderId);
      }
    }

    return msg;
  }

  async list(
    conversationId: string,
    userId: string,
    limit: number,
    before?: string,
  ): Promise<MessageResponse[]> {
    const member = await this.db.getPool().query(
      `SELECT 1 FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId],
    );
    if (member.rows.length === 0) throw new ForbiddenException('Not a member of this conversation');

    const safeLimit = Math.min(Math.max(1, limit), 100);

    let query: string;
    let params: any[];

    if (before) {
      query = `
        SELECT id, conversation_id, sender_id, type, content, created_at
        FROM messages
        WHERE conversation_id = $1 AND deleted_at IS NULL AND id < $2
        ORDER BY id DESC
        LIMIT $3
      `;
      params = [conversationId, before, safeLimit];
    } else {
      query = `
        SELECT id, conversation_id, sender_id, type, content, created_at
        FROM messages
        WHERE conversation_id = $1 AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT $2
      `;
      params = [conversationId, safeLimit];
    }

    const result = await this.db.getPool().query(query, params);
    return result.rows.map(this.toResponse);
  }

  private async getById(id: string): Promise<MessageResponse> {
    const result = await this.db.getPool().query(
      'SELECT id, conversation_id, sender_id, type, content, created_at FROM messages WHERE id = $1',
      [id],
    );
    return this.toResponse(result.rows[0]);
  }

  private toResponse(row: any): MessageResponse {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      type: row.type,
      content: row.content,
      createdAt: row.created_at,
    };
  }
}

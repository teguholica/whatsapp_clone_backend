import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async delete(messageId: string, userId: string, mode: 'me' | 'everyone'): Promise<{ message: string }> {
    const msg = await this.db.getPool().query(
      'SELECT id, conversation_id, sender_id, created_at FROM messages WHERE id = $1',
      [messageId],
    );
    if (msg.rows.length === 0) throw new NotFoundException('Message not found');

    if (mode === 'everyone') {
      if (msg.rows[0].sender_id !== userId) {
        throw new ForbiddenException('Only the sender can delete for everyone');
      }
      const age = Date.now() - new Date(msg.rows[0].created_at).getTime();
      if (age > 30 * 60 * 1000) {
        throw new BadRequestException('Cannot delete for everyone after 30 minutes');
      }
      await this.db.getPool().query(
        'UPDATE messages SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2',
        [userId, messageId],
      );
    } else {
      await this.db.getPool().query(
        `INSERT INTO message_deletions (message_id, user_id, deleted_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (message_id, user_id) DO UPDATE SET deleted_at = NOW()`,
        [messageId, userId],
      );
    }

    this.ws.broadcastToRoom(msg.rows[0].conversation_id, 'message:deleted', {
      messageId, mode,
    }, userId);

    return { message: 'Message deleted' };
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
        SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.created_at
        FROM messages m
        LEFT JOIN message_deletions md ON md.message_id = m.id AND md.user_id = $3
        WHERE m.conversation_id = $1
          AND m.deleted_at IS NULL
          AND md.deleted_at IS NULL
          AND m.id < $2
        ORDER BY m.id DESC
        LIMIT $4
      `;
      params = [conversationId, before, userId, safeLimit];
    } else {
      query = `
        SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.created_at
        FROM messages m
        LEFT JOIN message_deletions md ON md.message_id = m.id AND md.user_id = $3
        WHERE m.conversation_id = $1
          AND m.deleted_at IS NULL
          AND md.deleted_at IS NULL
        ORDER BY m.id DESC
        LIMIT $2
      `;
      params = [conversationId, safeLimit, userId];
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

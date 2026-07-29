import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ulid } from 'ulid';
import { DatabaseService } from '../shared/database/database.service';
import { CreateConversationDto, ConversationDetail, ConversationSummary } from './conversation.types';

@Injectable()
export class ConversationService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async create(userId: string, dto: CreateConversationDto): Promise<ConversationDetail> {
    const target = await this.db.getPool().query(
      'SELECT id FROM users WHERE phone = $1', [dto.phone],
    );
    if (target.rows.length === 0) throw new NotFoundException('User not found');

    const targetId = target.rows[0].id;
    if (targetId === userId) throw new BadRequestException('Cannot create conversation with self');

    const existing = await this.findExisting( userId, targetId);
    if (existing) return this.getDetail(existing.id, userId);

    const convId = ulid();
    await this.db.getPool().query(
      'INSERT INTO conversations (id, type) VALUES ($1, $2)',
      [convId, 'individual'],
    );
    await this.db.getPool().query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [convId, userId, targetId],
    );

    return this.getDetail(convId, userId);
  }

  async list(userId: string): Promise<ConversationSummary[]> {
    const result = await this.db.getPool().query(
      `SELECT DISTINCT ON (c.id) c.id, c.type, c.created_at,
              cm2.user_id AS other_id, u.display_name AS other_name,
              m.content AS last_content, m.created_at AS last_created
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
       LEFT JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id != $1 AND cm2.left_at IS NULL
       LEFT JOIN users u ON u.id = cm2.user_id
       LEFT JOIN LATERAL (
         SELECT content, created_at FROM messages
         WHERE conversation_id = c.id AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       ORDER BY c.id, COALESCE(m.created_at, c.created_at) DESC`,
      [userId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      otherUser: row.type === 'group' ? null : (row.other_id ? { id: row.other_id, displayName: row.other_name ?? null } : null),
      lastMessage: row.last_content ? { content: row.last_content, createdAt: row.last_created } : null,
      unreadCount: 0,
      createdAt: row.created_at,
    }));
  }

  async getDetail(convId: string, userId: string): Promise<ConversationDetail> {
    const conv = await this.db.getPool().query(
      `SELECT c.id, c.type, c.created_at FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
       WHERE c.id = $2`,
      [userId, convId],
    );
    if (conv.rows.length === 0) throw new NotFoundException('Conversation not found');

    const members = await this.db.getPool().query(
      `SELECT cm.user_id, u.display_name FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.left_at IS NULL`,
      [convId],
    );

    const lastMsg = await this.db.getPool().query(
      `SELECT content, created_at FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [convId],
    );

    return {
      id: conv.rows[0].id,
      type: conv.rows[0].type,
      members: members.rows.map((m: any) => ({ userId: m.user_id, displayName: m.display_name ?? null })),
      lastMessage: lastMsg.rows[0] ? { content: lastMsg.rows[0].content, createdAt: lastMsg.rows[0].created_at } : null,
      unreadCount: 0,
      createdAt: conv.rows[0].created_at,
    };
  }

  async leave(convId: string, userId: string): Promise<void> {
    const result = await this.db.getPool().query(
      `UPDATE conversation_members SET left_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [convId, userId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Conversation not found');
  }

  private async findExisting(userId: string, targetId: string): Promise<{ id: string } | null> {
    const result = await this.db.getPool().query(
      `SELECT c.id FROM conversations c
       WHERE c.type = 'individual'
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $1 AND left_at IS NULL)
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $2 AND left_at IS NULL)
       LIMIT 1`,
      [userId, targetId],
    );
    return result.rows[0] || null;
  }
}

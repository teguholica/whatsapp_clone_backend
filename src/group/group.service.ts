import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ulid } from 'ulid';
import { DatabaseService } from '../shared/database/database.service';
import { CreateGroupDto, UpdateGroupDto, AddMembersDto, PromoteAdminDto, GroupResponse } from './group.types';

@Injectable()
export class GroupService {
  private readonly maxMembers = 256;

  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async create(userId: string, dto: CreateGroupDto): Promise<GroupResponse> {
    if (dto.members.length + 1 > this.maxMembers) {
      throw new BadRequestException(`Group cannot exceed ${this.maxMembers} members`);
    }

    const memberIds = await this.resolvePhones(dto.members);

    if (memberIds.includes(userId)) {
      throw new BadRequestException('Cannot add yourself');
    }
    if (new Set(memberIds).size !== memberIds.length) {
      throw new BadRequestException('Duplicate members');
    }

    const convId = ulid();
    await this.db.getPool().query(
      'INSERT INTO conversations (id, type, name) VALUES ($1, $2, $3)',
      [convId, 'group', dto.name],
    );

    await this.db.getPool().query(
      `INSERT INTO conversation_members (conversation_id, user_id)
       SELECT $1, unnest($2::text[])`,
      [convId, memberIds],
    );

    await this.db.getPool().query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
      [convId, userId],
    );

    await this.db.getPool().query(
      'INSERT INTO group_admins (conversation_id, user_id) VALUES ($1, $2)',
      [convId, userId],
    );

    return this.getGroup(convId);
  }

  async update(convId: string, userId: string, dto: UpdateGroupDto): Promise<GroupResponse> {
    await this.requireAdmin(convId, userId);
    if (dto.name !== undefined) {
      await this.db.getPool().query(
        'UPDATE conversations SET name = $1 WHERE id = $2', [dto.name, convId],
      );
    }
    return this.getGroup(convId);
  }

  async addMembers(convId: string, userId: string, dto: AddMembersDto): Promise<GroupResponse> {
    await this.requireAdmin(convId, userId);

    const currentCount = await this.db.getPool().query(
      'SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL',
      [convId],
    );
    if (parseInt(currentCount.rows[0].count) + dto.members.length > this.maxMembers) {
      throw new BadRequestException(`Group cannot exceed ${this.maxMembers} members`);
    }

    const newIds = await this.resolvePhones(dto.members);
    for (const id of newIds) {
      await this.db.getPool().query(
        `INSERT INTO conversation_members (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL`,
        [convId, id],
      );
    }
    return this.getGroup(convId);
  }

  async removeMember(convId: string, requesterId: string, targetUserId: string): Promise<GroupResponse> {
    await this.requireAdmin(convId, requesterId);
    if (requesterId === targetUserId) throw new BadRequestException('Cannot remove yourself');

    await this.db.getPool().query(
      `UPDATE conversation_members SET left_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [convId, targetUserId],
    );
    await this.db.getPool().query(
      'DELETE FROM group_admins WHERE conversation_id = $1 AND user_id = $2',
      [convId, targetUserId],
    );
    return this.getGroup(convId);
  }

  async promoteAdmin(convId: string, requesterId: string, dto: PromoteAdminDto): Promise<GroupResponse> {
    await this.requireSuperAdmin(convId, requesterId);
    await this.requireMember(convId, dto.userId);
    await this.db.getPool().query(
      `INSERT INTO group_admins (conversation_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [convId, dto.userId],
    );
    return this.getGroup(convId);
  }

  async demoteAdmin(convId: string, requesterId: string, dto: PromoteAdminDto): Promise<GroupResponse> {
    await this.requireSuperAdmin(convId, requesterId);
    if (dto.userId === requesterId) throw new BadRequestException('Cannot demote yourself');
    await this.db.getPool().query(
      'DELETE FROM group_admins WHERE conversation_id = $1 AND user_id = $2',
      [convId, dto.userId],
    );
    return this.getGroup(convId);
  }

  private async getGroup(convId: string): Promise<GroupResponse> {
    const conv = await this.db.getPool().query(
      'SELECT id, name, type, created_at FROM conversations WHERE id = $1', [convId],
    );
    if (conv.rows.length === 0) throw new NotFoundException('Group not found');

    const members = await this.db.getPool().query(
      `SELECT cm.user_id, u.display_name FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.left_at IS NULL`,
      [convId],
    );

    const admins = await this.db.getPool().query(
      'SELECT user_id FROM group_admins WHERE conversation_id = $1', [convId],
    );

    return {
      id: conv.rows[0].id,
      name: conv.rows[0].name ?? '',
      type: conv.rows[0].type,
      members: members.rows.map((m: any) => ({ userId: m.user_id, displayName: m.display_name ?? null })),
      admins: admins.rows.map((r: any) => r.user_id),
      createdAt: conv.rows[0].created_at,
    };
  }

  private async requireAdmin(convId: string, userId: string): Promise<void> {
    const result = await this.db.getPool().query(
      'SELECT 1 FROM group_admins WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId],
    );
    if (result.rows.length === 0) {
      const isGroup = await this.db.getPool().query(
        "SELECT 1 FROM conversations WHERE id = $1 AND type = 'group'", [convId],
      );
      if (isGroup.rows.length > 0) throw new ForbiddenException('Admin access required');
      throw new NotFoundException('Group not found');
    }
  }

  private async requireSuperAdmin(convId: string, userId: string): Promise<void> {
    await this.requireAdmin(convId, userId);

    // ponytail: ctid reflects insertion order but VACUUM can change it
    // upgrade: add creator_id to conversations table
    const first = await this.db.getPool().query(
      `SELECT user_id FROM group_admins WHERE conversation_id = $1
       ORDER BY ctid LIMIT 1`,
      [convId],
    );
    if (first.rows.length === 0 || first.rows[0].user_id !== userId) {
      throw new ForbiddenException('Super admin access required');
    }
  }

  private async requireMember(convId: string, userId: string): Promise<void> {
    const result = await this.db.getPool().query(
      `SELECT 1 FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [convId, userId],
    );
    if (result.rows.length === 0) throw new BadRequestException('User is not a member');
  }

  private async resolvePhones(phones: string[]): Promise<string[]> {
    const placeholders = phones.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.db.getPool().query(
      `SELECT id FROM users WHERE phone IN (${placeholders})`,
      phones,
    );
    if (result.rows.length !== phones.length) {
      throw new BadRequestException('One or more phone numbers not found');
    }
    return result.rows.map((r: any) => r.id);
  }
}

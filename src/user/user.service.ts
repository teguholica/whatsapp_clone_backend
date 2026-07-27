import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../shared/database/database.service';
import { UpdateProfileDto, UserProfile } from './user.types';

@Injectable()
export class UserService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.db.getPool().query(
      `SELECT id, phone, display_name, avatar_url, last_seen_at FROM users WHERE id = $1`,
      [userId],
    );
    if (result.rows.length === 0) return null;
    return this.toProfile(result.rows[0]);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(dto.displayName);
    }
    if (dto.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(dto.avatarUrl);
    }

    if (fields.length === 0) return (await this.getProfile(userId)) as UserProfile;

    values.push(userId);
    await this.db.getPool().query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );

    return (await this.getProfile(userId)) as UserProfile;
  }

  async searchByPhone(query: string, excludeUserId: string): Promise<UserProfile[]> {
    const result = await this.db.getPool().query(
      `SELECT id, phone, display_name, avatar_url, last_seen_at
       FROM users
       WHERE phone LIKE $1 AND id != $2
       ORDER BY display_name NULLS LAST
       LIMIT 20`,
      [`%${query}%`, excludeUserId],
    );
    return result.rows.map(this.toProfile);
  }

  private toProfile(row: any): UserProfile {
    return {
      id: row.id,
      phone: row.phone,
      displayName: row.display_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    };
  }
}

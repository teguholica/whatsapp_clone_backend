import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { DatabaseService } from '../shared/database/database.service';

describe('ConversationService', () => {
  let svc: ConversationService;
  const mockPool = { query: jest.fn() };

  const userId = 'user1';
  const targetId = 'user2';
  const convId = 'conv1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: DatabaseService, useValue: dbMock },
      ],
    }).compile();

    svc = mod.get(ConversationService);
  });

  describe('create', () => {
    it('creates new conversation for phone not in existing', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: targetId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, type: 'individual', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.create(userId, { phone: '+62812345678' });

      const insertConv = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO conversations"),
      );
      expect(insertConv).toBeDefined();

      const insertMember = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO conversation_members"),
      );
      expect(insertMember).toBeDefined();
    });

    it('returns existing conversation (idempotent)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: targetId }] })
        .mockResolvedValueOnce({ rows: [{ id: convId }] })
        .mockResolvedValueOnce({ rows: [{ id: convId, type: 'individual', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.create(userId, { phone: '+62812345678' });

      const insertConv = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO conversations"),
      );
      expect(insertConv).toBeUndefined();
      expect(result.id).toBe(convId);
    });

    it('throws NotFoundException when target phone not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.create(userId, { phone: '+62800000000' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when creating conversation with self', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: userId }] });

      await expect(
        svc.create(userId, { phone: '+62812345678' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('returns conversations ordered by last message', async () => {
      const now = new Date();
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'c1', type: 'individual', created_at: now, other_id: targetId, other_name: 'User 2', last_content: 'Hi', last_created: now },
        ],
      });

      const result = await svc.list(userId);

      expect(result).toHaveLength(1);
      expect(result[0].otherUser).toEqual({ id: targetId, displayName: 'User 2' });
    });

    it('returns null otherUser for group conversations', async () => {
      const now = new Date();
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'g1', type: 'group', created_at: now, other_id: 'someone', other_name: null, last_content: 'Hello', last_created: now },
        ],
      });

      const result = await svc.list(userId);

      expect(result).toHaveLength(1);
      expect(result[0].otherUser).toBeNull();
    });

    it('excludes conversations user has left', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.list(userId);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('left_at IS NULL');
      expect(result).toEqual([]);
    });
  });

  describe('getDetail', () => {
    it('returns conversation with members', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: convId, type: 'individual', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ user_id: userId, display_name: 'User 1' }, { user_id: targetId, display_name: 'User 2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.getDetail(convId, userId);

      expect(result.members).toHaveLength(2);
      expect(result.type).toBe('individual');
    });

    it('throws NotFoundException for non-member', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.getDetail(convId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave', () => {
    it('soft-deletes membership', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await svc.leave(convId, userId);

      const update = mockPool.query.mock.calls[0][0] as string;
      expect(update).toContain('UPDATE');
      expect(update).toContain('left_at = NOW()');
    });

    it('throws NotFoundException when not a member', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        svc.leave(convId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

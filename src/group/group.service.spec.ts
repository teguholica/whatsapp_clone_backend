import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { GroupService } from './group.service';
import { DatabaseService } from '../shared/database/database.service';

describe('GroupService', () => {
  let svc: GroupService;
  const mockPool = { query: jest.fn() };

  const userId = 'admin1';
  const otherId = 'user2';
  const outsiderId = 'user3';
  const convId = 'group1';

  beforeEach(async () => {
    jest.resetAllMocks();

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: DatabaseService, useValue: dbMock },
      ],
    }).compile();

    svc = mod.get(GroupService);
  });

  describe('create', () => {
    it('creates group with admin and members', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: otherId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'Test Group', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.create(userId, { name: 'Test Group', members: ['+62812345678'] });

      const insertConv = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO conversations"),
      );
      expect(insertConv).toBeDefined();

      const insertAdmin = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO group_admins"),
      );
      expect(insertAdmin).toBeDefined();
      expect(insertAdmin![1]).toEqual([expect.any(String), userId]);
    });

    it('throws when exceeding max members', async () => {
      const manyPhones = Array.from({ length: 256 }, (_, i) => `+628${i}`);

      await expect(
        svc.create(userId, { name: 'Big Group', members: manyPhones }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when member phone not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.create(userId, { name: 'Test', members: ['+62800000000'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when creator includes own phone in members', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: userId }] });

      await expect(
        svc.create(userId, { name: 'Test', members: ['+62812345678'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('updates group name for admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'New Name', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.update(convId, userId, { name: 'New Name' });

      const update = mockPool.query.mock.calls.find(
        (c) => c[0].includes("UPDATE conversations"),
      );
      expect(update).toBeDefined();
      expect(update![1]).toEqual(['New Name', convId]);
    });

    it('throws ForbiddenException for non-admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      await expect(
        svc.update(convId, otherId, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMembers', () => {
    it('adds members for admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: otherId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'G', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.addMembers(convId, userId, { members: ['+62812345678'] });

      const insert = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO conversation_members"),
      );
      expect(insert).toBeDefined();
    });

    it('throws ForbiddenException for non-admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      await expect(
        svc.addMembers(convId, otherId, { members: ['+62812345678'] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeMember', () => {
    it('removes member for admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'G', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await svc.removeMember(convId, userId, otherId);

      const update = mockPool.query.mock.calls.find(
        (c) => c[0].includes("UPDATE conversation_members"),
      );
      expect(update).toBeDefined();
    });

    it('throws on self-removal', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      await expect(
        svc.removeMember(convId, userId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('promoteAdmin', () => {
    it('promotes member to admin by super admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'G', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await svc.promoteAdmin(convId, userId, { userId: otherId });

      const insert = mockPool.query.mock.calls.find(
        (c) => c[0].includes("INSERT INTO group_admins"),
      );
      expect(insert).toBeDefined();
    });

    it('throws ForbiddenException when non-super-admin tries to promote', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'someone-else' }] });

      await expect(
        svc.promoteAdmin(convId, otherId, { userId: 'userX' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('demoteAdmin', () => {
    it('demotes admin by super admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: convId, name: 'G', type: 'group', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await svc.demoteAdmin(convId, userId, { userId: otherId });

      const del = mockPool.query.mock.calls.find(
        (c) => c[0].includes("DELETE FROM group_admins"),
      );
      expect(del).toBeDefined();
    });

    it('throws on self-demotion', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: userId }] });

      await expect(
        svc.demoteAdmin(convId, userId, { userId }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

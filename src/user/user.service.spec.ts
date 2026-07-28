import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { DatabaseService } from '../shared/database/database.service';

describe('UserService', () => {
  let svc: UserService;
  const mockPool = { query: jest.fn() };

  const userId = '01ARBQS4S5X3PNC3P0QN8Y6DVA';
  const now = new Date();

  const userRow = {
    id: userId,
    phone: '+62812345678',
    display_name: 'Test User',
    avatar_url: '/uploads/avatar.jpg',
    last_seen_at: now,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DatabaseService, useValue: dbMock },
      ],
    }).compile();

    svc = mod.get(UserService);
  });

  describe('getProfile', () => {
    it('returns user profile when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [userRow] });

      const result = await svc.getProfile(userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId],
      );
      expect(result).toEqual({
        id: userId,
        phone: '+62812345678',
        displayName: 'Test User',
        avatarUrl: '/uploads/avatar.jpg',
        lastSeenAt: now.toISOString(),
      });
    });

    it('returns null when user not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.getProfile(userId);

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('updates displayName', async () => {
      const updatedRow = { ...userRow, display_name: 'New Name' };
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await svc.updateProfile(userId, { displayName: 'New Name' });

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE users'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(['New Name', userId]);
      expect(result.displayName).toBe('New Name');
    });

    it('updates avatarUrl', async () => {
      const updatedRow = { ...userRow, avatar_url: '/uploads/new.jpg' };
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await svc.updateProfile(userId, { avatarUrl: '/uploads/new.jpg' });

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE users'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(['/uploads/new.jpg', userId]);
      expect(result.avatarUrl).toBe('/uploads/new.jpg');
    });

    it('updates both displayName and avatarUrl', async () => {
      const updatedRow = { ...userRow, display_name: 'New', avatar_url: '/uploads/new.jpg' };
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await svc.updateProfile(userId, {
        displayName: 'New',
        avatarUrl: '/uploads/new.jpg',
      });

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE users'),
      );
      expect(updateCall).toBeDefined();
      expect(result.displayName).toBe('New');
      expect(result.avatarUrl).toBe('/uploads/new.jpg');
    });

    it('returns current profile when no fields provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [userRow] });

      const result = await svc.updateProfile(userId, {});

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE'),
      );
      expect(updateCall).toBeUndefined();
      expect(result.id).toBe(userId);
    });

    it('returns null displayName and avatarUrl when null in DB', async () => {
      const nullRow = { ...userRow, display_name: null, avatar_url: null };
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [nullRow] });

      const result = await svc.updateProfile(userId, { displayName: 'Name' });

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE'),
      );
      expect(updateCall).toBeDefined();
      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
    });
  });

  describe('searchByPhone', () => {
    const otherId = '01ARBQS4S5X3PNC3P0QN8Y6DVB';
    const otherRow = {
      id: otherId,
      phone: '+62898765432',
      display_name: 'Other User',
      avatar_url: null,
      last_seen_at: null,
    };

    it('finds users by partial phone match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [otherRow] });

      const result = await svc.searchByPhone('9876', userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIKE'),
        ['%9876%', userId],
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(otherId);
    });

    it('excludes self from results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.searchByPhone('6281', userId);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('id != $2');
      expect(result).toEqual([]);
    });

    it('returns empty array when no match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.searchByPhone('nonexistent', userId);

      expect(result).toEqual([]);
    });

    it('limits results to 20', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: Array(20).fill(otherRow) });

      const result = await svc.searchByPhone('628', userId);

      expect(result).toHaveLength(20);
    });
  });
});

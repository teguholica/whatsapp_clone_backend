import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let svc: DatabaseService;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => {
            const s = new DatabaseService();
            (s as any).pool = { query: mockQuery, end: jest.fn() };
            return s;
          },
        },
      ],
    }).compile();

    svc = mod.get(DatabaseService);
  });

  describe('isHealthy', () => {
    it('returns true when pool.query succeeds', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await svc.isHealthy();

      expect(result).toBe(true);
    });

    it('returns false when pool.query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await svc.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('onModuleInit does not throw', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(svc.onModuleInit()).resolves.toBeUndefined();
    });

    it('onModuleDestroy does not throw', async () => {
      const mockEnd = jest.fn().mockResolvedValue(undefined);
      (svc as any).pool.end = mockEnd;

      await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});

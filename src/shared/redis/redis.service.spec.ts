import { RedisService } from './redis.service';

jest.mock('ioredis', () => ({ Redis: jest.fn() }));

describe('RedisService', () => {
  let svc: RedisService;
  let mockPing: jest.Mock;
  let mockQuit: jest.Mock;

  beforeEach(() => {
    mockPing = jest.fn();
    mockQuit = jest.fn();
    svc = new RedisService();
    (svc as any).client = { ping: mockPing, quit: mockQuit };
  });

  describe('isHealthy', () => {
    it('returns true when ping succeeds', async () => {
      mockPing.mockResolvedValue('PONG');

      const result = await svc.isHealthy();

      expect(result).toBe(true);
    });

    it('returns false when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));

      const result = await svc.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('onModuleInit does not throw', async () => {
      mockPing.mockResolvedValue('PONG');

      await expect(svc.onModuleInit()).resolves.toBeUndefined();
    });

    it('onModuleDestroy does not throw', async () => {
      mockQuit.mockResolvedValue(undefined);

      await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});

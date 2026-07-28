import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service';
import { RedisService } from '../shared/redis/redis.service';

describe('RateLimitService', () => {
  let svc: RateLimitService;
  const mockRedisClient = {
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const key = 'test-key';
  const maxAttempts = 5;
  const windowSec = 60;

  beforeEach(async () => {
    jest.clearAllMocks();

    const redisMock: jest.Mocked<Partial<RedisService>> = {
      getClient: jest.fn().mockReturnValue(mockRedisClient as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    svc = mod.get(RateLimitService);
  });

  describe('check', () => {
    it('returns true when under limit', async () => {
      mockRedisClient.incr.mockResolvedValue(3);

      const result = await svc.check(key, maxAttempts, windowSec);

      expect(result).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(`ratelimit:${key}`);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(`ratelimit:${key}`, windowSec);
    });

    it('returns true when exactly at limit', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      const result = await svc.check(key, maxAttempts, windowSec);

      expect(result).toBe(true);
    });

    it('returns false when over limit', async () => {
      mockRedisClient.incr.mockResolvedValue(6);

      const result = await svc.check(key, maxAttempts, windowSec);

      expect(result).toBe(false);
    });

    it('uses different keys for different rate limit scopes', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await svc.check('login:user1', 3, 10);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('ratelimit:login:user1');
    });
  });
});

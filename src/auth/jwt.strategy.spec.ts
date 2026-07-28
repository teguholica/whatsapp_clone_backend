import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { RedisService } from '../shared/redis/redis.service';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let redisGet: jest.Mock;

  const mockReq = (token: string) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  const payload = { sub: 'u1', phone: '+6281' };

  beforeEach(async () => {
    redisGet = jest.fn();

    const redisMock: jest.Mocked<Partial<RedisService>> = {
      getClient: jest.fn(() => ({ get: redisGet }) as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    strategy = mod.get(JwtStrategy);
  });

  describe('validate', () => {
    it('returns user when token matches stored session', async () => {
      redisGet.mockResolvedValue('valid-token');

      const result = await strategy.validate(mockReq('valid-token'), payload);

      expect(redisGet).toHaveBeenCalledWith('session:u1');
      expect(result).toEqual({ id: 'u1', phone: '+6281' });
    });

    it('throws UnauthorizedException when no stored session', async () => {
      redisGet.mockResolvedValue(null);

      await expect(
        strategy.validate(mockReq('valid-token'), payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token mismatches', async () => {
      redisGet.mockResolvedValue('different-token');

      await expect(
        strategy.validate(mockReq('valid-token'), payload),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

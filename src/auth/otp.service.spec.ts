import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { RedisService } from '../shared/redis/redis.service';

describe('OtpService', () => {
  let svc: OtpService;
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn(),
  };

  const phone = '+62812345678';

  beforeEach(async () => {
    jest.clearAllMocks();

    const redisMock: jest.Mocked<Partial<RedisService>> = {
      getClient: jest.fn().mockReturnValue(mockRedisClient as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    svc = mod.get(OtpService);
  });

  describe('generate', () => {
    it('generates a 6-digit code and stores in Redis with TTL', async () => {
      const code = await svc.generate(phone);

      expect(code).toMatch(/^\d{6}$/);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `otp:${phone}`,
        code,
        'EX',
        300,
      );
    });

    it('returns different codes on successive calls', async () => {
      const code1 = await svc.generate(phone);
      const code2 = await svc.generate(phone);

      expect(code1).not.toBe(code2);
    });
  });

  describe('verify', () => {
    it('returns true for matching OTP', async () => {
      mockRedisClient.get.mockResolvedValue('123456');

      const result = await svc.verify(phone, '123456');

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`otp:${phone}`);
    });

    it('returns false for mismatched OTP', async () => {
      mockRedisClient.get.mockResolvedValue('123456');

      const result = await svc.verify(phone, '654321');

      expect(result).toBe(false);
    });

    it('returns false when OTP expired or not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await svc.verify(phone, '123456');

      expect(result).toBe(false);
    });
  });

  describe('consume', () => {
    it('deletes OTP from Redis', async () => {
      await svc.consume(phone);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`otp:${phone}`);
    });
  });
});

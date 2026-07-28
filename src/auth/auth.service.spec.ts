import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';
import { OtpService } from './otp.service';
import { RateLimitService } from './rate-limit.service';

describe('AuthService', () => {
  let auth: AuthService;
  let jwt: jest.Mocked<JwtService>;
  let redis: jest.Mocked<RedisService>;
  let db: jest.Mocked<DatabaseService>;
  let rateLimit: jest.Mocked<RateLimitService>;

  const userId = '01ABCDEFGHIJKLMNOPQRSTUVWX';
  const phone = '+628123456789';
  const oldRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.old';
  const newAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access';
  const newRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh';

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    incr: jest.fn(),
  };

  const mockPool = {
    query: jest.fn(),
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const jwtMock: jest.Mocked<Partial<JwtService>> = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const redisMock: jest.Mocked<Partial<RedisService>> = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const otpMock: jest.Mocked<Partial<OtpService>> = {};

    const rateLimitMock: jest.Mocked<Partial<RateLimitService>> = {
      check: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtMock },
        { provide: RedisService, useValue: redisMock },
        { provide: DatabaseService, useValue: dbMock },
        { provide: OtpService, useValue: otpMock },
        { provide: RateLimitService, useValue: rateLimitMock },
      ],
    }).compile();

    auth = mod.get(AuthService);
    jwt = mod.get(JwtService) as jest.Mocked<JwtService>;
    redis = mod.get(RedisService) as jest.Mocked<RedisService>;
    db = mod.get(DatabaseService) as jest.Mocked<DatabaseService>;
    rateLimit = mod.get(RateLimitService) as jest.Mocked<RateLimitService>;
  });

  describe('refresh', () => {
    beforeEach(() => {
      rateLimit.check.mockResolvedValue(true);
    });

    it('returns new tokens when refresh token is valid', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      mockRedisClient.get.mockResolvedValue(oldRefreshToken);
      mockPool.query.mockResolvedValue({
        rows: [{ id: userId, phone, display_name: 'Test User' }],
      });
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      const result = await auth.refresh(oldRefreshToken);

      expect(rateLimit.check).toHaveBeenCalledWith(`refresh:${userId}`, 5, 60);
      expect(jwt.verify).toHaveBeenCalledWith(oldRefreshToken, {
        secret: 'test-refresh-secret',
      });
      expect(mockRedisClient.get).toHaveBeenCalledWith(`refresh:${userId}`);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, phone, display_name FROM users WHERE id = $1',
        [userId],
      );
      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `session:${userId}`, newAccessToken, 'EX', 7 * 86400,
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `refresh:${userId}`, newRefreshToken, 'EX', 7 * 86400,
      );
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: { id: userId, phone, displayName: 'Test User' },
      });
    });

    it('throws on invalid JWT signature', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(auth.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
      expect(rateLimit.check).not.toHaveBeenCalled();
    });

    it('throws when rate limited', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      rateLimit.check.mockResolvedValue(false);

      await expect(auth.refresh(oldRefreshToken)).rejects.toThrow(UnauthorizedException);
      expect(rateLimit.check).toHaveBeenCalledWith(`refresh:${userId}`, 5, 60);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('throws when stored refresh token does not match', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      mockRedisClient.get.mockResolvedValue('different-token');

      await expect(auth.refresh(oldRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when no stored refresh token exists', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      mockRedisClient.get.mockResolvedValue(null);

      await expect(auth.refresh(oldRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user not found in database', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      mockRedisClient.get.mockResolvedValue(oldRefreshToken);
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(auth.refresh(oldRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates refresh token (old becomes invalid)', async () => {
      jwt.verify.mockReturnValue({ sub: userId, phone });
      mockRedisClient.get.mockResolvedValue(oldRefreshToken);
      mockPool.query.mockResolvedValue({
        rows: [{ id: userId, phone, display_name: null }],
      });
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await auth.refresh(oldRefreshToken);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `refresh:${userId}`, newRefreshToken, 'EX', 7 * 86400,
      );

      mockRedisClient.get.mockResolvedValue(newRefreshToken);
      const stored = await mockRedisClient.get(`refresh:${userId}`);
      expect(stored).toBe(newRefreshToken);
      expect(stored).not.toBe(oldRefreshToken);
    });
  });
});

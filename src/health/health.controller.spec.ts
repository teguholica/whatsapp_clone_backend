import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';

describe('HealthController', () => {
  let ctrl: HealthController;
  let db: jest.Mocked<DatabaseService>;
  let redis: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      isHealthy: jest.fn(),
    };
    const redisMock: jest.Mocked<Partial<RedisService>> = {
      isHealthy: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DatabaseService, useValue: dbMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    ctrl = mod.get(HealthController);
    db = mod.get(DatabaseService) as jest.Mocked<DatabaseService>;
    redis = mod.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe('check', () => {
    it('returns ok when both DB and Redis respond', async () => {
      db.isHealthy.mockResolvedValue(true);
      redis.isHealthy.mockResolvedValue(true);

      const result = await ctrl.check();

      expect(result).toEqual({
        status: 'ok',
        db: 'connected',
        redis: 'connected',
      });
    });

    it('returns degraded when DB is down', async () => {
      db.isHealthy.mockResolvedValue(false);
      redis.isHealthy.mockResolvedValue(true);

      const result = await ctrl.check();

      expect(result).toEqual({
        status: 'degraded',
        db: 'disconnected',
        redis: 'connected',
      });
    });

    it('returns degraded when Redis is down', async () => {
      db.isHealthy.mockResolvedValue(true);
      redis.isHealthy.mockResolvedValue(false);

      const result = await ctrl.check();

      expect(result).toEqual({
        status: 'degraded',
        db: 'connected',
        redis: 'disconnected',
      });
    });

    it('returns degraded when both are down', async () => {
      db.isHealthy.mockResolvedValue(false);
      redis.isHealthy.mockResolvedValue(false);

      const result = await ctrl.check();

      expect(result).toEqual({
        status: 'degraded',
        db: 'disconnected',
        redis: 'disconnected',
      });
    });
  });
});

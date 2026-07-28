import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanup } from './setup';

describe('Health E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // app closed via --forceExit
  });

  beforeEach(async () => {
    await cleanup(app);
  });

  describe('GET /api/health', () => {
    it('returns ok when db and redis are connected', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body).toEqual({
        status: 'ok',
        db: 'connected',
        redis: 'connected',
      });
    });
  });
});

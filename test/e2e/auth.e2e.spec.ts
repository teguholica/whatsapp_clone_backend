import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RedisService } from 'src/shared/redis/redis.service';
import { createTestApp, createUser, cleanup, TestUser } from './setup';

describe('Auth E2E', () => {
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

  describe('POST /api/auth/register', () => {
    const phone = '+6281000000001';

    it('returns OTP sent on first register', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);
      expect(res.body).toEqual({ message: 'OTP sent' });
    });

    it('is idempotent — duplicate phone returns OTP sent', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);
      expect(res.body).toEqual({ message: 'OTP sent' });
    });

    it('rejects invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone: 'invalid' })
        .expect(400);
    });
  });

  describe('POST /api/auth/verify', () => {
    const phone = '+6281000000002';

    it('returns tokens with valid OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);

      const redis = app.get(RedisService);
      const otp = await redis.getClient().get(`otp:${phone}`);

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ phone, otp })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        phone,
        displayName: null,
      });
      expect(res.body.user).toHaveProperty('id');
    });

    it('returns 401 with wrong OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ phone, otp: '999999' })
        .expect(401);
    });

    it('rate limits after 5 failed attempts', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ phone })
        .expect(200);

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/verify')
          .send({ phone, otp: '999999' })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ phone, otp: '999999' })
        .expect(429);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let user: TestUser;

    beforeEach(async () => {
      user = await createUser(app);
    });

    it('returns new token pair on valid refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        id: user.user.id,
        phone: user.phone,
      });
    });

    it('invalidates old refresh token after rotation', async () => {
      await new Promise((r) => setTimeout(r, 1100));

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      const newToken = res.body.refreshToken;

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: newToken })
        .expect(200);
    });

    it('returns 401 with garbage token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'garbage-token' })
        .expect(401);
    });
  });
});

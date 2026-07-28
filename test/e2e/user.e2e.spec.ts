import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createUser, cleanup, TestUser } from './setup';

describe('User E2E', () => {
  let app: INestApplication;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // app closed via --forceExit
  });

  beforeEach(async () => {
    await cleanup(app);
    user = await createUser(app);
  });

  describe('GET /api/users/me', () => {
    it('returns own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: user.user.id,
        phone: user.phone,
        displayName: null,
        avatarUrl: null,
      });
      expect(res.body).toHaveProperty('lastSeenAt');
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me')
        .expect(401);
    });
  });

  describe('PUT /api/users/me', () => {
    it('updates display name and avatar', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ displayName: 'John', avatarUrl: '/uploads/avatar.jpg' })
        .expect(200);

      expect(res.body.displayName).toBe('John');
      expect(res.body.avatarUrl).toBe('/uploads/avatar.jpg');
    });

    it('persists update on subsequent GET', async () => {
      await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ displayName: 'Persist' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.displayName).toBe('Persist');
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .put('/api/users/me')
        .send({ displayName: 'John' })
        .expect(401);
    });
  });

  describe('GET /api/users/search', () => {
    let other: TestUser;

    beforeEach(async () => {
      other = await createUser(app);
    });

    it('finds users by partial phone', async () => {
      const query = other.phone.substring(0, 10);
      const res = await request(app.getHttpServer())
        .get(`/api/users/search?phone=${encodeURIComponent(query)}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(other.user.id);
    });

    it('excludes self from results', async () => {
      const query = user.phone.substring(0, 10);
      const res = await request(app.getHttpServer())
        .get(`/api/users/search?phone=${encodeURIComponent(query)}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const ids = res.body.map((u: any) => u.id);
      expect(ids).not.toContain(user.user.id);
    });

    it('returns empty array when query is empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/search?phone=')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/users/search?phone=6281')
        .expect(401);
    });
  });
});

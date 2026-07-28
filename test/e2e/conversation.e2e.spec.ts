import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createUser, cleanup, TestUser } from './setup';

describe('Conversation E2E', () => {
  let app: INestApplication;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanup(app);
    userA = await createUser(app);
    userB = await createUser(app);
  });

  function auth(token: string) {
    return (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  }

  describe('POST /api/conversations', () => {
    it('creates a 1-on-1 conversation', async () => {
      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      expect(res.body.type).toBe('individual');
      expect(res.body.members).toHaveLength(2);
      const ids = res.body.members.map((m: any) => m.userId);
      expect(ids).toContain(userA.user.id);
      expect(ids).toContain(userB.user.id);
    });

    it('returns 400 when creating conversation with self', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userA.phone }),
      ).expect(400);
    });

    it('returns 404 when target phone is not registered', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: '+6289999999999' }),
      ).expect(404);
    });

    it('is idempotent — same pair returns same conversation', async () => {
      const first = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      const second = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      expect(second.body.id).toBe(first.body.id);
    });
  });

  describe('GET /api/conversations', () => {
    it('lists conversations for the user', async () => {
      const conv = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer()).get('/api/conversations'),
      ).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(conv.body.id);
    });

    it('excludes conversations user has left', async () => {
      const conv = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/conversations/${conv.body.id}`),
      ).expect(200);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer()).get('/api/conversations'),
      ).expect(200);

      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('returns conversation detail with members', async () => {
      const conv = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer()).get(`/api/conversations/${conv.body.id}`),
      ).expect(200);

      expect(res.body.id).toBe(conv.body.id);
      expect(res.body.members).toHaveLength(2);
    });

    it('returns 404 for non-member', async () => {
      const userC = await createUser(app);
      const conv = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      await auth(userC.accessToken)(
        request(app.getHttpServer()).get(`/api/conversations/${conv.body.id}`),
      ).expect(404);
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('leaves a conversation and returns confirmation', async () => {
      const conv = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post('/api/conversations')
          .send({ phone: userB.phone }),
      ).expect(201);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/conversations/${conv.body.id}`),
      ).expect(200);

      expect(res.body).toEqual({ message: 'Left conversation' });
    });

    it('returns 404 on unknown conversation', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete('/api/conversations/nonexistent'),
      ).expect(404);
    });
  });
});

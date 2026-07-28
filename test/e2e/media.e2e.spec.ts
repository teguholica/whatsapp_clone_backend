import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createUser, cleanup, TestUser } from './setup';

describe('Media E2E', () => {
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

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${user.accessToken}`);
  }

  describe('POST /api/media/upload', () => {
    it('uploads a valid image', async () => {
      const res = await auth(
        request(app.getHttpServer())
          .post('/api/media/upload')
          .attach('file', Buffer.from('fake-png-data'), 'test.png'),
      ).expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toMatch(/^\/uploads\//);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.fileSize).toBeGreaterThan(0);
    });

    it('rejects invalid file type', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/media/upload')
          .attach('file', Buffer.from('fake-exe'), 'virus.exe'),
      ).expect(400);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/media/upload')
        .attach('file', Buffer.from('data'), 'test.png')
        .expect(401);
    });
  });
});

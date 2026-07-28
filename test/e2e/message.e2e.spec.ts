import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from 'src/shared/database/database.service';
import { createTestApp, createUser, cleanup, createWsClient, waitForWsEvent, sendWsMessage, TestUser } from './setup';

describe('Message E2E', () => {
  let app: INestApplication;
  let userA: TestUser;
  let userB: TestUser;
  let userC: TestUser;
  let conversationId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // app closed via --forceExit
  });

  beforeEach(async () => {
    await cleanup(app);
    userA = await createUser(app);
    userB = await createUser(app);
    userC = await createUser(app);

    const conv = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ phone: userB.phone })
      .expect(201);

    conversationId = conv.body.id;
  });

  function auth(token: string) {
    return (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  }

  describe('POST /api/messages/:conversationId', () => {
    it('sends a text message', async () => {
      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'Hello!' }),
      ).expect(201);

      expect(res.body).toMatchObject({
        conversationId,
        senderId: userA.user.id,
        type: 'text',
        content: 'Hello!',
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('returns 400 with empty content', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: '' }),
      ).expect(400);
    });

    it('returns 403 for non-member', async () => {
      await auth(userC.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'Hi' }),
      ).expect(403);
    });
  });

  describe('GET /api/messages/:conversationId', () => {
    it('lists messages newest-first', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'First' }),
      ).expect(201);

      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'Second' }),
      ).expect(201);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}?limit=10`),
      ).expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].content).toBe('Second');
      expect(res.body[1].content).toBe('First');
    });

    it('paginates with before cursor', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'First' }),
      ).expect(201);

      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content: 'Second' }),
      ).expect(201);

      const all = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}?limit=10`),
      ).expect(200);

      const secondId = all.body[0].id;

      const before = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}?before=${secondId}`),
      ).expect(200);

      expect(before.body).toHaveLength(1);
      expect(before.body[0].content).toBe('First');
    });

    it('returns empty array when no messages', async () => {
      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 403 for non-member', async () => {
      await auth(userC.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(403);
    });
  });

  describe('DELETE /api/messages/:messageId', () => {
    async function sendMessage(token: string, content: string) {
      const res = await auth(token)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content }),
      ).expect(201);
      return res.body;
    }

    it('deletes for self (mode=me)', async () => {
      const msg = await sendMessage(userA.accessToken, 'Secret');
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/messages/${msg.id}?mode=me`),
      ).expect(200);

      const res = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(200);
      expect(res.body).toHaveLength(0);

      const resB = await auth(userB.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(200);
      expect(resB.body).toHaveLength(1);
    });

    it('deletes for everyone as sender', async () => {
      const msg = await sendMessage(userA.accessToken, 'Oops');
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/messages/${msg.id}?mode=everyone`),
      ).expect(200);

      const resA = await auth(userA.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(200);
      expect(resA.body).toHaveLength(0);

      const resB = await auth(userB.accessToken)(
        request(app.getHttpServer())
          .get(`/api/messages/${conversationId}`),
      ).expect(200);
      expect(resB.body).toHaveLength(0);
    });

    it('returns 403 when non-sender tries delete for everyone', async () => {
      const msg = await sendMessage(userA.accessToken, 'Mine');
      await auth(userB.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/messages/${msg.id}?mode=everyone`),
      ).expect(403);
    });

    it('returns 400 when deleting for everyone after 30 minutes', async () => {
      const msg = await sendMessage(userA.accessToken, 'Old');

      const db = app.get(DatabaseService);
      const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      await db.getPool().query(
        'UPDATE messages SET created_at = $1 WHERE id = $2',
        [old, msg.id],
      );

      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/messages/${msg.id}?mode=everyone`),
      ).expect(400);
    });

    it('returns 404 for unknown message', async () => {
      await auth(userA.accessToken)(
        request(app.getHttpServer())
          .delete('/api/messages/nonexistent?mode=me'),
      ).expect(404);
    });
  });

  describe('message status lifecycle', () => {
    async function sendMessage(token: string, content: string) {
      const res = await auth(token)(
        request(app.getHttpServer())
          .post(`/api/messages/${conversationId}`)
          .send({ content }),
      ).expect(201);
      return res.body;
    }

    it('creates a sent status row for recipient after sending', async () => {
      const msg = await sendMessage(userA.accessToken, 'Hello!');

      const db = app.get(DatabaseService);
      const result = await db.getPool().query(
        'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
        [msg.id, userB.user.id],
      );

      expect(result.rows[0].status).toBe('sent');
    });

    it('upgrades status to delivered when recipient joins room via WS', async () => {
      const msg = await sendMessage(userA.accessToken, 'Hello!');

      const wsB = await createWsClient(app, userB.accessToken);
      await new Promise((r) => setTimeout(r, 200));

      const db = app.get(DatabaseService);

      // send room:join and wait for deliverPending
      await sendWsMessage(wsB, 'room:join', { conversationId });
      for (let i = 0; i < 30; i++) {
        const r = await db.getPool().query(
          'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
          [msg.id, userB.user.id],
        );
        if (r.rows[0]?.status === 'delivered') break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const result = await db.getPool().query(
        'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
        [msg.id, userB.user.id],
      );
      expect(result.rows[0].status).toBe('delivered');

      wsB.close();
    });

    it('upgrades status to read when recipient sends message:read event', async () => {
      const msg = await sendMessage(userA.accessToken, 'Hello!');

      const wsB = await createWsClient(app, userB.accessToken);
      await sendWsMessage(wsB, 'room:join', { conversationId });

      // wait for deliverPending to upgrade to delivered
      await new Promise((r) => setTimeout(r, 300));

      await sendWsMessage(wsB, 'message:read', { messageId: msg.id });

      // wait for markRead to process
      await new Promise((r) => setTimeout(r, 500));

      const db = app.get(DatabaseService);
      const result = await db.getPool().query(
        'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
        [msg.id, userB.user.id],
      );
      expect(result.rows[0].status).toBe('read');

      wsB.close();
    });

    it('does not let non-recipient trigger a read status update', async () => {
      const msg = await sendMessage(userA.accessToken, 'Hello!');

      const wsC = await createWsClient(app, userC.accessToken);
      await sendWsMessage(wsC, 'message:read', { messageId: msg.id });
      await new Promise((r) => setTimeout(r, 500));

      const db = app.get(DatabaseService);
      const result = await db.getPool().query(
        'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
        [msg.id, userB.user.id],
      );
      expect(result.rows[0].status).toBe('sent');

      wsC.close();
    });

    it('is idempotent on re-join', async () => {
      const msg = await sendMessage(userA.accessToken, 'Hello!');

      const wsB = await createWsClient(app, userB.accessToken);
      await sendWsMessage(wsB, 'room:join', { conversationId });

      // wait for deliverPending
      await new Promise((r) => setTimeout(r, 500));

      await sendWsMessage(wsB, 'room:leave', { conversationId });
      await sendWsMessage(wsB, 'room:join', { conversationId });
      await new Promise((r) => setTimeout(r, 500));

      const db = app.get(DatabaseService);
      const result = await db.getPool().query(
        'SELECT status FROM message_status WHERE message_id = $1 AND user_id = $2',
        [msg.id, userB.user.id],
      );
      expect(result.rows[0].status).toBe('delivered');

      wsB.close();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { createTestApp, createUser, cleanup, createWsClient, TestUser } from './setup';

describe('WebSocket E2E', () => {
  let app: INestApplication;
  let userA: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  }, 15000);

  afterAll(() => {});

  beforeEach(async () => {
    await cleanup(app);
    userA = await createUser(app);
  });

  describe('connect', () => {
    it('connects with valid token', async () => {
      const ws = await createWsClient(app, userA.accessToken);
      ws.close();
    });

    it('closes with 4001 when no token', async () => {
      const server = app.getHttpServer();
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3000;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
      await new Promise<void>((resolve) => {
        ws.on('close', (code) => { expect(code).toBe(4001); resolve(); });
      });
    });
  });
});

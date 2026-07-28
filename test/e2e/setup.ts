import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { RedisService } from 'src/shared/redis/redis.service';
import { DatabaseService } from 'src/shared/database/database.service';
import { WsGateway } from 'src/ws/ws.gateway';
import request from 'supertest';
import { Pool } from 'pg';
import { WebSocket } from 'ws';

const TEST_DB = 'whatsapp_test';
const TEST_DB_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB}`;

let dbSetupDone = false;

export interface TestUser {
  user: { id: string; phone: string; displayName: string | null };
  accessToken: string;
  refreshToken: string;
  phone: string;
}

export async function ensureTestDb(): Promise<void> {
  if (dbSetupDone) return;
  dbSetupDone = true;

  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  const adminPool = new Pool({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
  });
  try {
    await adminPool.query(`CREATE DATABASE ${TEST_DB}`);
  } catch {}
  await adminPool.end();

  await runMigrations();
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const applied = await pool.query(
      `SELECT name FROM migrations WHERE name = ANY($1)`,
      [['001_create_users', '002_create_conversations', '003_create_messages', '004_create_groups', '005_message_deletions']],
    );
    const done = new Set(applied.rows.map((r: any) => r.name));

    if (!done.has('001_create_users')) {
      await pool.query(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          phone VARCHAR(20) NOT NULL UNIQUE,
          display_name VARCHAR(100),
          avatar_url TEXT,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('001_create_users')`);
    }

    if (!done.has('002_create_conversations')) {
      await pool.query(`
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          type VARCHAR(20) NOT NULL DEFAULT 'individual',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE conversation_members (
          conversation_id TEXT NOT NULL REFERENCES conversations(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          left_at TIMESTAMPTZ,
          PRIMARY KEY (conversation_id, user_id)
        )
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('002_create_conversations')`);
    }

    if (!done.has('003_create_messages')) {
      await pool.query(`
        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id),
          sender_id TEXT NOT NULL REFERENCES users(id),
          type VARCHAR(20) NOT NULL DEFAULT 'text',
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          deleted_by TEXT
        );
        CREATE TABLE message_status (
          message_id TEXT NOT NULL REFERENCES messages(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          status VARCHAR(20) NOT NULL DEFAULT 'sent',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (message_id, user_id)
        )
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('003_create_messages')`);
    }

    if (!done.has('004_create_groups')) {
      await pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name VARCHAR(100);
        CREATE TABLE IF NOT EXISTS group_admins (
          conversation_id TEXT NOT NULL REFERENCES conversations(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          PRIMARY KEY (conversation_id, user_id)
        )
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('004_create_groups')`);
    }

    if (!done.has('005_message_deletions')) {
      await pool.query(`
        CREATE TABLE message_deletions (
          message_id TEXT NOT NULL REFERENCES messages(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (message_id, user_id)
        )
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('005_message_deletions')`);
    }
  } finally {
    await pool.end();
  }
}

let cachedApp: INestApplication | null = null;

export async function createTestApp(): Promise<INestApplication> {
  if (cachedApp) return cachedApp;

  await ensureTestDb();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();

  const wsGateway = app.get(WsGateway);
  const httpServer = app.getHttpServer();
  wsGateway.attach(httpServer);

  cachedApp = app;
  return app;
}

let phoneCounter = 0;

export async function createUser(app: INestApplication, phone?: string): Promise<TestUser> {
  phoneCounter++;
  const p = phone ?? `+6281${String(phoneCounter).padStart(7, '0')}`;

  const registerRes = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ phone: p })
    .expect(200);
  expect(registerRes.body).toEqual({ message: 'OTP sent' });

  const redis = app.get(RedisService);
  let otp: string | null = null;
  for (let i = 0; i < 20; i++) {
    otp = await redis.getClient().get(`otp:${p}`);
    if (otp) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!otp) throw new Error(`OTP not found for ${p}`);

  const verifyRes = await request(app.getHttpServer())
    .post('/api/auth/verify')
    .send({ phone: p, otp })
    .expect(200);

  return {
    user: verifyRes.body.user,
    accessToken: verifyRes.body.accessToken,
    refreshToken: verifyRes.body.refreshToken,
    phone: p,
  };
}

export async function cleanup(app: INestApplication): Promise<void> {
  const db = app.get(DatabaseService);
  const pool = db.getPool();
  try {
    await pool.query('SET session_replication_role = replica');
    await pool.query('TRUNCATE TABLE message_deletions, message_status, messages, conversation_members, group_admins, conversations, users CASCADE');
    await pool.query('SET session_replication_role = origin');
  } catch {
    try {
      await pool.query('TRUNCATE TABLE message_deletions, message_status, messages, conversation_members, group_admins, conversations, users');
    } catch {}
  }

  const redis = app.get(RedisService);
  await redis.getClient().flushdb();
}

export async function closeTestApp(): Promise<void> {
  if (!cachedApp) return;
  await cachedApp.close();
  cachedApp = null;
}

export function waitForWsEvent(ws: WebSocket, event: string, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WS event "${event}" not received within ${timeout}ms`)), timeout);
    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === event) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg.data);
        }
      } catch {}
    };
    ws.on('message', handler);
  });
}

export async function createWsClient(app: INestApplication, token: string): Promise<WebSocket> {
  const server = app.getHttpServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3000;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS connection timeout')), 3000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return ws;
}

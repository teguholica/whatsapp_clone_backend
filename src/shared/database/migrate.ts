import { Pool } from 'pg';

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/whatsapp',
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Migrations table ready');

    const result = await pool.query(`SELECT name FROM migrations WHERE name = '001_create_users'`);
    if (result.rows.length === 0) {
      await pool.query(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          phone VARCHAR(20) NOT NULL UNIQUE,
          display_name VARCHAR(100),
          avatar_url TEXT,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('001_create_users')`);
      console.log('Migration 001_create_users applied');
    } else {
      console.log('Migration 001_create_users already applied, skipping');
    }

    const convResult = await pool.query(`SELECT name FROM migrations WHERE name = '002_create_conversations'`);
    if (convResult.rows.length === 0) {
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
        );
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('002_create_conversations')`);
      console.log('Migration 002_create_conversations applied');
    } else {
      console.log('Migration 002_create_conversations already applied, skipping');
    }

    const msgResult = await pool.query(`SELECT name FROM migrations WHERE name = '003_create_messages'`);
    if (msgResult.rows.length === 0) {
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
        );
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('003_create_messages')`);
      console.log('Migration 003_create_messages applied');
    } else {
      console.log('Migration 003_create_messages already applied, skipping');
    }

    const grpResult = await pool.query(`SELECT name FROM migrations WHERE name = '004_create_groups'`);
    if (grpResult.rows.length === 0) {
      await pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name VARCHAR(100);
        CREATE TABLE IF NOT EXISTS group_admins (
          conversation_id TEXT NOT NULL REFERENCES conversations(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          PRIMARY KEY (conversation_id, user_id)
        );
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('004_create_groups')`);
      console.log('Migration 004_create_groups applied');
    } else {
      console.log('Migration 004_create_groups already applied, skipping');
    }

    const delResult = await pool.query(`SELECT name FROM migrations WHERE name = '005_message_deletions'`);
    if (delResult.rows.length === 0) {
      await pool.query(`
        CREATE TABLE message_deletions (
          message_id TEXT NOT NULL REFERENCES messages(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (message_id, user_id)
        );
      `);
      await pool.query(`INSERT INTO migrations (name) VALUES ('005_message_deletions')`);
      console.log('Migration 005_message_deletions applied');
    } else {
      console.log('Migration 005_message_deletions already applied, skipping');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

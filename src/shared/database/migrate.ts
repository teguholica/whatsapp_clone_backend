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
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

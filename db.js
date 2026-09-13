const { Pool } = require('pg');
const { newDb, DataType } = require('pg-mem');
const crypto = require('crypto');
require('dotenv').config();

const realPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5432/booking_db',
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 1000,
});

realPool.on('error', (err) => {
  // Silent catch idle client disconnects when server is down
});

let isInMemory = false;
let memAdapterInstance = null;

class InMemoryPgAdapter {
  constructor() {
    this.memDb = newDb();

    this.memDb.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.text,
      implementation: () => crypto.randomUUID(),
    });

    // Create tables in memory
    this.memDb.public.none(`
      CREATE TABLE IF NOT EXISTS slots (
        id UUID PRIMARY KEY,
        time VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'
      );
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key VARCHAR(255) PRIMARY KEY,
        booking_result TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const { Pool: MemPool } = this.memDb.adapters.createPg();
    this.pool = new MemPool();
  }

  connect() {
    return this.pool.connect();
  }

  query(text, params) {
    return this.pool.query(text, params);
  }
}

async function initDb() {
  try {
    const client = await realPool.connect();
    try {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_status') THEN
            CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'BOOKED');
          END IF;
        END
        $$;
        CREATE TABLE IF NOT EXISTS slots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          time VARCHAR(255) NOT NULL,
          status slot_status NOT NULL DEFAULT 'AVAILABLE'
        );
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          key VARCHAR(255) PRIMARY KEY,
          booking_result JSONB DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_slots_id_status ON slots(id, status);
      `);
      console.log('[DB Init] Connected to native PostgreSQL database.');
      isInMemory = false;
    } finally {
      client.release();
    }
  } catch (err) {
    console.log('[DB Init] PostgreSQL service not detected on port 5432. Active mode: In-Memory PostgreSQL engine (pg-mem).');
    isInMemory = true;
    memAdapterInstance = new InMemoryPgAdapter();
  }
}

function getPool() {
  return isInMemory ? memAdapterInstance : realPool;
}

module.exports = {
  getPool,
  query: (text, params) => getPool().query(text, params),
  connect: () => getPool().connect(),
  initDb,
  isInMemoryMode: () => isInMemory,
};

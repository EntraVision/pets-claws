const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

function getSslConfig(connectionString) {
  const sslMode = process.env.PGSSLMODE || '';
  const dbSsl = process.env.DB_SSL || '';

  if (/^(disable|false|0)$/i.test(sslMode) || /^(false|0)$/i.test(dbSsl)) {
    return false;
  }

  if (/^(require|no-verify|true|1)$/i.test(sslMode) || /^(true|1)$/i.test(dbSsl)) {
    return { rejectUnauthorized: false };
  }

  if (!connectionString) {
    return false;
  }

  try {
    const url = new URL(connectionString);
    const urlSslMode = url.searchParams.get('sslmode');
    if (urlSslMode === 'disable') return false;
    if (urlSslMode) return { rejectUnauthorized: false };

    if (url.hostname.includes('neon.tech')) {
      return { rejectUnauthorized: false };
    }
  } catch (err) {
    return false;
  }

  return false;
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: getSslConfig(connectionString),
});

let initPromise;

async function initialize() {
  if (!initPromise) {
    initPromise = (async () => {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');

      await pool.query(schema);
      await pool.query(`
        ALTER TABLE items
          ADD COLUMN IF NOT EXISTS expiry_date DATE,
          ADD COLUMN IF NOT EXISTS expiry_warning_months INTEGER NOT NULL DEFAULT 3;
        ALTER TABLE sale_lines
          ALTER COLUMN item_id DROP NOT NULL;
        CREATE TABLE IF NOT EXISTS returns (
          id SERIAL PRIMARY KEY,
          subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
          total NUMERIC(12,2) NOT NULL DEFAULT 0,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS return_lines (
          id SERIAL PRIMARY KEY,
          return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
          item_name VARCHAR(255) NOT NULL,
          barcode VARCHAR(100),
          quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
          unit_type VARCHAR(20) NOT NULL,
          unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
          unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
          line_total NUMERIC(12,2) NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
        CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);
      `);
    })();
  }

  return initPromise;
}

module.exports = {
  initialize,
  query: async (...args) => {
    await initialize();
    return pool.query(...args);
  },
  connect: async (...args) => {
    await initialize();
    return pool.connect(...args);
  },
  end: (...args) => pool.end(...args),
};

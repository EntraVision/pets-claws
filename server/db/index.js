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
        CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
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

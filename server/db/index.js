const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const migrationReady = pool.query(`
  ALTER TABLE items
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS expiry_warning_months INTEGER NOT NULL DEFAULT 3;
  ALTER TABLE sale_lines
    ALTER COLUMN item_id DROP NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
`);

module.exports = {
  query: async (...args) => {
    await migrationReady;
    return pool.query(...args);
  },
  connect: async (...args) => {
    await migrationReady;
    return pool.connect(...args);
  },
  end: (...args) => pool.end(...args),
};

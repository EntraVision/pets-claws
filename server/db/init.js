require('dotenv').config();
const db = require('./index');

async function init() {
  try {
    await db.initialize();
    console.log('Database tables are ready.');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

init();

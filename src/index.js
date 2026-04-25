require('dotenv').config();
const pool = require('./db/connection');

async function main() {
  const conn = await pool.getConnection();
  console.log('Connected to MySQL:', process.env.DB_NAME);
  conn.release();
  await pool.end();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

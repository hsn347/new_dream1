const pg = require('pg');

async function checkUsers() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT id, email, role, status FROM users');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err.message);
  } finally {
    pool.end();
  }
}

checkUsers();

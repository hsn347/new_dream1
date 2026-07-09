const bcrypt = require('bcryptjs');
const pg = require('pg');

async function createUser() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash('owner123', 10);
  
  try {
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, phone, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id`,
      ['المدير الجديد', 'owner@demo.com', hash, 'admin', 'active', '+966500000001']
    );
    console.log("User created with ID:", res.rows[0].id);
    
    // Also create user settings
    await pool.query(
      `INSERT INTO user_settings (user_id, agent_enabled, currency) VALUES ($1, true, 'SAR')`,
      [res.rows[0].id]
    );
    console.log("Settings created.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

createUser();

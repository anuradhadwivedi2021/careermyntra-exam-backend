// ============================================
// CareerMyntra Exam Portal - One-time Super Admin Bootstrap
// ============================================
// Why this script exists:
// POST /api/admin-auth/register now requires a valid super-admin token
// (see routes/adminAuthRoutes.js), so on a brand-new database there is no
// way to create the FIRST admin through the API - that would be a chicken-
// and-egg problem. Run this script once, directly against the database,
// to create that first super admin. After that, always use the admin
// panel's "Add admin" screen (which calls the protected /register route).
//
// Usage:
//   SUPER_ADMIN_NAME="Site Owner" SUPER_ADMIN_EMAIL="owner@careermyntra.com" SUPER_ADMIN_PASSWORD="choose-a-strong-password" node scripts/create-super-admin.js
//
// Safety:
// - Refuses to run if a super admin already exists (idempotent - safe to
//   re-run by accident).
// - Reads credentials from environment variables only, never hardcoded,
//   so nothing sensitive ends up committed to git.

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function run() {
  const full_name = process.env.SUPER_ADMIN_NAME;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!full_name || !email || !password) {
    console.error('Missing env vars. Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD and re-run.');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('SUPER_ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  try {
    const existingSuper = await pool.query(`SELECT admin_id, email FROM admins WHERE role = 'super' LIMIT 1`);
    if (existingSuper.rows.length > 0) {
      console.log(`A super admin already exists (${existingSuper.rows[0].email}). Not creating another one.`);
      console.log('Use the admin panel to invite additional admins instead.');
      process.exit(0);
    }

    const existingEmail = await pool.query('SELECT admin_id FROM admins WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
      console.error(`An admin with email ${email} already exists but is not a super admin. Aborting.`);
      process.exit(1);
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO admins (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'super')
       RETURNING admin_id, full_name, email, role`,
      [full_name, email, password_hash]
    );

    console.log('Super admin created:', result.rows[0]);
    console.log('You can now log in at /admin/login and use the admin panel to add other admins.');
  } catch (err) {
    console.error('Failed to create super admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

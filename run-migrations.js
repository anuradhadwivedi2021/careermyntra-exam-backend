// One-time script to apply pending migrations to the live database.
// Run with: node run-migrations.js
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const migrations = [
  'database/migration_category.sql',
  'database/migration_subjective.sql',
  'database/migration_coding.sql',
  'database/migration_payments.sql',
  'database/migration_gallery.sql',
  'database/migration_coupons.sql',
  'database/migration_coding_execution.sql',
  'database/migration_settings.sql',
  'database/migration_cms.sql',
  'database/migration_cms_repeatable.sql',
  'database/migration_roles.sql',
  'database/migration_eligibility.sql',
  'database/migration_email_verification.sql',
  // ↓ ye sab pehle is list me nahi thi — database/ folder me file existed
  //   par run-migrations.js kabhi update nahi hui thi
  'database/migration_sections.sql',
  'database/migration_proctoring.sql',
  'database/migration_contact.sql',
  'database/migration_result_visibility.sql',
  'database/migration_result_detail.sql',
  'database/migration_refunds.sql',
  'database/migration_extra_question_types.sql',
  'database/migration_approval_autosave.sql',
  'database/migration_audit.sql',
  'database/migration_terms_consent.sql',
  'database/migration_exam_type_and_publish.sql',
  'database/migration_section_marks.sql',
  'database/migration_gallery_media_type.sql',
  'database/migration_notification_logs.sql',
  'database/migration_exam_security.sql',
  'database/migration_candidate_sessions.sql',
  'database/migration_randomization.sql',
  'database/migration_pricing_plans.sql',

  'database/migration_candidate_photo.sql',

];

async function run() {
  for (const file of migrations) {
    const fullPath = path.join(__dirname, file);
    console.log(`\n▶ Running ${file}...`);
    try {
      // Reading the file is now INSIDE the try block too — a missing/renamed
      // migration file used to throw here uncaught and silently abort every
      // migration listed after it (this is how migration_candidate_sessions.sql
      // never got applied, which is why candidate login was failing).
      const sql = fs.readFileSync(fullPath, 'utf8');
      await pool.query(sql);
      console.log(`✅ ${file} applied.`);
    } catch (err) {
      console.log(`⚠️  ${file}: ${err.message}`);
    }
  }
  console.log('\nDone. You can delete this file now.');
  await pool.end();
}

run();
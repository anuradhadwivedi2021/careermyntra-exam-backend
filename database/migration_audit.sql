-- ============================================
-- CareerMyntra Exam Portal - Audit Log Migration
-- Run this once on your existing database
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(admin_id) ON DELETE SET NULL,
    admin_name VARCHAR(150) NOT NULL,   -- denormalized so the log still reads fine if the admin is later deleted
    action TEXT NOT NULL,               -- human-readable description, e.g. 'Published exam "General Aptitude Mock Test"'
    module VARCHAR(50) NOT NULL,        -- e.g. 'Exams', 'Settings', 'Website content'
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
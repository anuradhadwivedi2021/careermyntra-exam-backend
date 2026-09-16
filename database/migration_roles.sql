-- ============================================
-- CareerMyntra Exam Portal - Roles & Permissions Migration
-- Run this once on your existing database
-- ============================================

-- Fixed list of admin-panel modules that can be toggled per role
CREATE TABLE IF NOT EXISTS permission_modules (
    module_name VARCHAR(50) PRIMARY KEY,
    display_order INTEGER NOT NULL
);

INSERT INTO permission_modules (module_name, display_order) VALUES
    ('Dashboard', 1),
    ('Students', 2),
    ('Exams', 3),
    ('Question bank', 4),
    ('Evaluation', 5),
    ('Registrations', 6),
    ('Pricing & payments', 7),
    ('Results', 8),
    ('Reports', 9),
    ('Website content', 10),
    ('Settings', 11)
ON CONFLICT (module_name) DO NOTHING;

-- Admin roles. role_id matches the values already stored in admins.role
CREATE TABLE IF NOT EXISTS admin_roles (
    role_id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,   -- TRUE = super admin, always full access, cannot be edited
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO admin_roles (role_id, name, description, is_system) VALUES
    ('super', 'Super admin', 'Full access to every module.', TRUE),
    ('exam', 'Exam admin', 'Exams, questions, registrations, results.', FALSE),
    ('evaluator', 'Evaluator', 'Subjective and coding evaluation only.', FALSE),
    ('content', 'Content admin', 'Website, gallery, banners, FAQs.', FALSE),
    ('finance', 'Finance admin', 'Pricing, payments, transactions, refunds.', FALSE)
ON CONFLICT (role_id) DO NOTHING;

-- Per-role, per-module access matrix
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(30) REFERENCES admin_roles(role_id) ON DELETE CASCADE,
    module_name VARCHAR(50) REFERENCES permission_modules(module_name) ON DELETE CASCADE,
    has_access BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (role_id, module_name)
);

-- Seed the same default access matrix currently hardcoded in app/admin/roles/page.tsx
INSERT INTO role_permissions (role_id, module_name, has_access)
SELECT 'super', module_name, TRUE FROM permission_modules
ON CONFLICT (role_id, module_name) DO NOTHING;

INSERT INTO role_permissions (role_id, module_name, has_access)
SELECT 'exam', module_name,
    (module_name IN ('Dashboard', 'Exams', 'Question bank', 'Registrations', 'Results'))
FROM permission_modules
ON CONFLICT (role_id, module_name) DO NOTHING;

INSERT INTO role_permissions (role_id, module_name, has_access)
SELECT 'evaluator', module_name,
    (module_name IN ('Dashboard', 'Evaluation'))
FROM permission_modules
ON CONFLICT (role_id, module_name) DO NOTHING;

INSERT INTO role_permissions (role_id, module_name, has_access)
SELECT 'content', module_name,
    (module_name IN ('Dashboard', 'Website content'))
FROM permission_modules
ON CONFLICT (role_id, module_name) DO NOTHING;

INSERT INTO role_permissions (role_id, module_name, has_access)
SELECT 'finance', module_name,
    (module_name IN ('Dashboard', 'Pricing & payments', 'Reports'))
FROM permission_modules
ON CONFLICT (role_id, module_name) DO NOTHING;
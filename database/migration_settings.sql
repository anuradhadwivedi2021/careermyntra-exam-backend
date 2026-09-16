-- ============================================
-- CareerMyntra Exam Portal - Settings Migration
-- Run this once on your existing database
-- ============================================

CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,

    -- General settings
    site_name VARCHAR(100) DEFAULT 'CareerMyntra',
    support_email VARCHAR(150) DEFAULT 'support@careermyntra.com',
    support_phone VARCHAR(30) DEFAULT '+91 98765 43210',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency VARCHAR(10) DEFAULT 'INR',
    maintenance_mode BOOLEAN DEFAULT FALSE,
    allow_registrations BOOLEAN DEFAULT TRUE,
    otp_login BOOLEAN DEFAULT TRUE,

    -- Branding settings
    brand_name VARCHAR(100) DEFAULT 'CareerMyntra',
    tagline VARCHAR(200) DEFAULT 'Career Guidance • Assessment • Training • Opportunities',
    footer_tagline VARCHAR(200) DEFAULT 'Career Aptitude Test | Admission Guidance | Training | Internship | Jobs',
    primary_color VARCHAR(10) DEFAULT '#2554F0',
    secondary_color VARCHAR(10) DEFAULT '#16A34A',
    logo_url TEXT,
    favicon_url TEXT,

    updated_at TIMESTAMP DEFAULT NOW(),

    -- Only one row ever allowed
    CONSTRAINT single_row_check CHECK (id = 1)
);

-- Seed the single settings row if it doesn't exist yet
INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
-- ============================================
-- CareerMyntra Exam Portal - Gallery Module Migration
-- ============================================

CREATE TABLE IF NOT EXISTS gallery (
    gallery_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    image_url TEXT NOT NULL,
    is_published BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES admins(admin_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_published ON gallery(is_published);
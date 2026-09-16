-- ============================================
-- CareerMyntra Exam Portal - Proctoring Migration
-- Run this once on your existing database
-- ============================================

-- Per-exam proctoring settings (admin turns these on/off when creating/editing an exam)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS proctoring_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_camera BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_fullscreen BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_id_verification BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS tab_switch_limit INTEGER DEFAULT 3;

-- Every suspicious/security event during an attempt (tab switch, fullscreen exit, no face, etc.)
CREATE TABLE IF NOT EXISTS proctoring_events (
    event_id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'tab_switch', 'fullscreen_exit', 'fullscreen_enter',
        'window_blur', 'window_focus', 'copy_paste', 'right_click',
        'multiple_faces', 'no_face', 'suspicious_activity'
    )),
    details TEXT,
    occurred_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proctoring_events_attempt ON proctoring_events(attempt_id);

-- Webcam photo captures taken during the attempt (start-of-exam photo, periodic snapshots)
-- image_url can be a real hosted URL, or a base64 data-URI for now since the project
-- doesn't have cloud file storage (S3/Cloudinary) wired up yet.
CREATE TABLE IF NOT EXISTS proctoring_captures (
    capture_id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    capture_type VARCHAR(20) NOT NULL CHECK (capture_type IN ('start_photo', 'periodic_photo')),
    image_url TEXT NOT NULL,
    captured_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proctoring_captures_attempt ON proctoring_captures(attempt_id);

-- ID document verification, one row per attempt
CREATE TABLE IF NOT EXISTS id_verifications (
    verification_id SERIAL PRIMARY KEY,
    attempt_id INTEGER UNIQUE REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    id_document_url TEXT NOT NULL,
    selfie_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by INTEGER REFERENCES admins(admin_id),
    verified_at TIMESTAMP,
    notes TEXT,
    submitted_at TIMESTAMP DEFAULT NOW()
);
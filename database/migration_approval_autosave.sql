-- ============================================
-- CareerMyntra Exam Portal - Approve/Reject + Auto-save Migration
-- Run this once on your database
-- ============================================

-- 1. Registration approval workflow
ALTER TABLE exam_registrations ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
-- status: 'pending' | 'approved' | 'rejected'
ALTER TABLE exams ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;

-- 2. Auto-save / resume support for in-progress attempts
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS draft_answers JSONB;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMP;
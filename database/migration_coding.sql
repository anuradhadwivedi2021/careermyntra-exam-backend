-- ============================================
-- CareerMyntra Exam Portal - Coding Module Migration
-- Run this once on your existing database
-- ============================================

-- 1. Coding-specific fields on questions (question_type = 'coding')
ALTER TABLE questions ADD COLUMN IF NOT EXISTS starter_code TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER DEFAULT 2;

-- 2. Test cases for coding questions
CREATE TABLE IF NOT EXISTS coding_test_cases (
    test_case_id SERIAL PRIMARY KEY,
    question_id INTEGER REFERENCES questions(question_id) ON DELETE CASCADE,
    input TEXT,
    expected_output TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
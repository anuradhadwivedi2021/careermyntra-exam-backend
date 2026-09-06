-- ============================================
-- CareerMyntra Exam Portal - Subjective Module Migration
-- Run this once on your existing database
-- ============================================

-- 1. Question type (mcq or subjective)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'mcq';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS word_limit INTEGER;

-- 2. Candidate answers: allow free-text answers alongside MCQ selection
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS is_evaluated BOOLEAN DEFAULT TRUE;
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Attempts: flag when manual evaluation is pending
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS needs_evaluation BOOLEAN DEFAULT FALSE;
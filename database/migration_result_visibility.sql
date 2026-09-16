-- ============================================
-- CareerMyntra Exam Portal - Result Visibility Migration
-- Adds per-exam admin controls for what candidates see after submitting
-- Run this once on your database
-- ============================================

ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_result_immediately BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_correct_answers BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_explanation BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_rank BOOLEAN DEFAULT TRUE;
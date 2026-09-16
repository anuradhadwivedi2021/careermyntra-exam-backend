-- ============================================
-- CareerMyntra Exam Portal - Extra Question Types Migration
-- Adds support for True/False and Multi-select MCQ answers
-- Run this once on your database
-- ============================================

-- Stores multiple selected option IDs for multi_select questions
-- (selected_option_id is still used for single-select mcq / true_false)
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS selected_option_ids INTEGER[];
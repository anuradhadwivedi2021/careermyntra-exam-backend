-- ============================================
-- CareerMyntra Exam Portal - Question & Option Randomization
-- Adds two per-exam ON/OFF toggles (same pattern as negative_marking,
-- proctoring_enabled, etc.):
--   randomize_questions — shuffle question order (within each section)
--                          per candidate/attempt
--   randomize_options   — shuffle MCQ/multi-select option order
--                          per candidate/attempt
-- Both default to FALSE so existing exams keep their current fixed order
-- until an admin explicitly turns this on.
-- ============================================

ALTER TABLE exams ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS randomize_options BOOLEAN DEFAULT FALSE;
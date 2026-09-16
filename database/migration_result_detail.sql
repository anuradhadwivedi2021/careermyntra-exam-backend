-- ============================================
-- CareerMyntra Exam Portal - Result Detail Page
-- Adds per-exam admin controls for section-wise
-- analysis and the full detailed report.
-- ============================================
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_section_analysis BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_detailed_report BOOLEAN DEFAULT TRUE;
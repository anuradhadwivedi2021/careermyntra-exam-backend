-- Section-wise navigation: groups an exam's questions into named sections
-- (e.g. "Quantitative Aptitude", "Reasoning") with independent ordering.
-- A question with section_id = NULL is treated as ungrouped / a single
-- default section, so this is backward-compatible with existing exams.

CREATE TABLE IF NOT EXISTS exam_sections (
    section_id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    section_name VARCHAR(150) NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES exam_sections(section_id) ON DELETE SET NULL;

-- Keeps question order stable within a section (falls back to question_id
-- insertion order for exams that never set this).
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_questions_section_id ON questions(section_id);
CREATE INDEX IF NOT EXISTS idx_exam_sections_exam_id ON exam_sections(exam_id);
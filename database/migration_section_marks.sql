-- exam_sections previously only tracked name + order (pure navigation grouping).
-- Adds total_marks so an admin can allocate marks per section
-- (e.g. Quantitative Aptitude = 25 marks, Reasoning = 25 marks) as required
-- by the "Section-wise marks" item in the exam configuration spec.
ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS total_marks INTEGER;
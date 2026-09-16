-- Adds two exam-config fields missing against the client requirement doc:
--   1. exam_type: kept separate from `category` (mock/aptitude/skills/coding/subjective)
--      so an admin can tag e.g. "Objective" vs "Subjective" vs "Coding" independent of category.
--   2. result_publish_at: lets an admin schedule a future date/time for results to
--      become visible, instead of only an immediate on/off toggle (show_result_immediately).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_type VARCHAR(30);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS result_publish_at TIMESTAMP;
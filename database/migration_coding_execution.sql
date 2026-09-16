
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS language VARCHAR(30);
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS test_case_results JSONB;


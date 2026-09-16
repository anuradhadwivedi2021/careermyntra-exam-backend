ALTER TABLE exams ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'mock';

ALTER TABLE exams ADD CONSTRAINT exams_category_check
  CHECK (category IN ('mock', 'aptitude', 'skills', 'coding', 'subjective'));
  ALTER TABLE exams ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;
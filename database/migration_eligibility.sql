-- Candidate profile fields needed to validate eligibility
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS qualification VARCHAR(20);

ALTER TABLE candidates ADD CONSTRAINT candidates_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));

ALTER TABLE candidates ADD CONSTRAINT candidates_qualification_check
  CHECK (qualification IS NULL OR qualification IN ('10th', '12th', 'diploma', 'graduate', 'postgraduate'));

-- Exam-level eligibility configuration
ALTER TABLE exams ADD COLUMN IF NOT EXISTS has_eligibility_criteria BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS min_qualification VARCHAR(20) DEFAULT 'none';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_age INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS gender_restriction VARCHAR(10) DEFAULT 'any';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS eligibility_notes TEXT;

ALTER TABLE exams ADD CONSTRAINT exams_min_qualification_check
  CHECK (min_qualification IN ('none', '10th', '12th', 'diploma', 'graduate', 'postgraduate'));

ALTER TABLE exams ADD CONSTRAINT exams_gender_restriction_check
  CHECK (gender_restriction IN ('any', 'male', 'female'));

-- Track why a registration was rejected on eligibility grounds (useful for admin support queries)
ALTER TABLE exam_registrations ADD COLUMN IF NOT EXISTS eligibility_rejection_reason TEXT;
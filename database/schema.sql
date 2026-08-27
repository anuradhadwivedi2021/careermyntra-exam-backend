-- ============================================
-- CareerMyntra Exam Portal - Phase 1 Schema
-- Objective Test Module
-- ============================================

-- 1. CANDIDATES (Student registration + OTP verification)
CREATE TABLE candidates (
    candidate_id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    mobile_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    mobile_verified BOOLEAN DEFAULT FALSE,
    otp_code VARCHAR(6),
    otp_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. ADMINS (simple admin login for this phase)
CREATE TABLE admins (
    admin_id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. EXAMS (exam configuration)
CREATE TABLE exams (
    exam_id SERIAL PRIMARY KEY,
    exam_name VARCHAR(200) NOT NULL,
    description TEXT,
    instructions TEXT,
    duration_minutes INTEGER NOT NULL,
    total_marks INTEGER NOT NULL,
    passing_marks INTEGER,
    negative_marking BOOLEAN DEFAULT FALSE,
    negative_marks_per_question NUMERIC(4,2) DEFAULT 0,
    attempt_limit INTEGER DEFAULT 1,
    is_free BOOLEAN DEFAULT TRUE,
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    show_result_immediately BOOLEAN DEFAULT TRUE,
    show_correct_answers BOOLEAN DEFAULT TRUE,
    show_explanation BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'draft', -- draft, published, closed
    created_by INTEGER REFERENCES admins(admin_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. QUESTIONS (question bank, linked to exam for Phase 1 simplicity)
CREATE TABLE questions (
    question_id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_image_url TEXT,
    subject VARCHAR(100),
    topic VARCHAR(100),
    difficulty VARCHAR(20) DEFAULT 'medium', -- easy, medium, hard
    marks NUMERIC(4,2) DEFAULT 1,
    negative_marks NUMERIC(4,2) DEFAULT 0,
    explanation TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. QUESTION_OPTIONS (MCQ options)
CREATE TABLE question_options (
    option_id SERIAL PRIMARY KEY,
    question_id INTEGER REFERENCES questions(question_id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    option_order INTEGER DEFAULT 1
);

-- 6. EXAM_REGISTRATIONS (candidate registers for an exam)
CREATE TABLE exam_registrations (
    registration_id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    registered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (candidate_id, exam_id)
);

-- 7. EXAM_ATTEMPTS (tracks each attempt)
CREATE TABLE exam_attempts (
    attempt_id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, submitted, auto_submitted
    total_score NUMERIC(6,2),
    percentage NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. CANDIDATE_ANSWERS (answer per question per attempt)
CREATE TABLE candidate_answers (
    answer_id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option_id INTEGER REFERENCES question_options(option_id),
    is_correct BOOLEAN,
    marks_awarded NUMERIC(4,2) DEFAULT 0,
    answered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (attempt_id, question_id)
);

-- 9. RESULTS (final summary per attempt)
CREATE TABLE results (
    result_id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE UNIQUE,
    candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    total_questions INTEGER,
    correct_count INTEGER,
    incorrect_count INTEGER,
    unattempted_count INTEGER,
    total_score NUMERIC(6,2),
    percentage NUMERIC(5,2),
    rank INTEGER,
    generated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_candidates_mobile ON candidates(mobile_number);
CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_options_question ON question_options(question_id);
CREATE INDEX idx_attempts_candidate ON exam_attempts(candidate_id);
CREATE INDEX idx_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX idx_answers_attempt ON candidate_answers(attempt_id);
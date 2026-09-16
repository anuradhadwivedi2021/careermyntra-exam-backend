-- ============================================
-- CareerMyntra Exam Portal - Payments Module Migration
-- Run this once on your existing database
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(20) DEFAULT 'created', -- created, success, failed, refunded
    razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    coupon_code VARCHAR(50),
    discount_amount NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_candidate ON transactions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_transactions_exam ON transactions(exam_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(razorpay_order_id);
-- ============================================
-- CareerMyntra Exam Portal - Refunds Migration
-- Adds real refund tracking to the transactions table
-- (previously "refund" only flipped status, with no link to an
-- actual Razorpay refund). Run this once on your existing database.
-- ============================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS razorpay_refund_id VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_by INTEGER REFERENCES admins(admin_id);

-- status now also takes 'partially_refunded' alongside the existing
-- created / success / failed / refunded values (no CHECK constraint on
-- this column, so no ALTER needed for the new value).

CREATE INDEX IF NOT EXISTS idx_transactions_refund_id ON transactions(razorpay_refund_id);
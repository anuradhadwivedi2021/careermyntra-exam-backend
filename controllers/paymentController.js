const crypto = require('crypto');
const Razorpay = require('razorpay');
const pool = require('../config/db');
const { checkEligibility } = require('../services/eligibilityService');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Candidate: create a Razorpay order for a paid exam
exports.createOrder = async (req, res) => {
  const { exam_id, coupon_code } = req.body;
  const candidate_id = req.candidate.candidate_id;

  if (!exam_id) {
    return res.status(400).json({ success: false, message: 'exam_id is required' });
  }

  try {
    const examResult = await pool.query(
      `SELECT exam_id, exam_name, status, is_free, price, end_datetime,
              has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction
       FROM exams WHERE exam_id = $1`,
      [exam_id]
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examResult.rows[0];

    if (exam.status !== 'published') {
      return res.status(400).json({ success: false, message: 'This exam is not open for registration' });
    }
    if (exam.is_free || Number(exam.price) <= 0) {
      return res.status(400).json({ success: false, message: 'This exam is free — no payment required' });
    }
    if (exam.end_datetime && new Date() > new Date(exam.end_datetime)) {
      return res.status(400).json({ success: false, message: 'Registration for this exam has closed' });
    }

    // Check eligibility BEFORE taking payment — a candidate should never pay
    // for an exam they can't actually attempt.
    if (exam.has_eligibility_criteria) {
      const candidateResult = await pool.query(
        'SELECT date_of_birth, gender, qualification FROM candidates WHERE candidate_id = $1',
        [candidate_id]
      );
      const candidate = candidateResult.rows[0] || {};
      const eligibility = checkEligibility(exam, candidate);
      if (!eligibility.eligible) {
        return res.status(403).json({ success: false, message: eligibility.message, eligibility_failed: true });
      }
    }

    const alreadyRegistered = await pool.query(
      'SELECT registration_id FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (alreadyRegistered.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Already registered for this exam' });
    }

    let amount = Number(exam.price);
    let discount_amount = 0;
    let appliedCoupon = null;

    // Optional coupon support — safe no-op if coupons table doesn't exist yet
    if (coupon_code) {
      try {
        const couponResult = await pool.query(
          `SELECT * FROM coupons WHERE code = $1 AND is_active = TRUE
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())`,
          [coupon_code.trim().toUpperCase()]
        );
        if (couponResult.rows.length > 0) {
          const coupon = couponResult.rows[0];
          if (coupon.discount_type === 'percentage') {
            discount_amount = Math.round((amount * Number(coupon.discount_value)) / 100 * 100) / 100;
          } else {
            discount_amount = Number(coupon.discount_value);
          }
          discount_amount = Math.min(discount_amount, amount);
          amount = Math.max(amount - discount_amount, 0);
          appliedCoupon = coupon.code;
        }
      } catch (couponErr) {
        // coupons table may not exist yet — ignore and proceed at full price
        console.warn('Coupon check skipped:', couponErr.message);
      }
    }

    const amountInPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `exam_${exam_id}_cand_${candidate_id}_${Date.now()}`,
      notes: { exam_id: String(exam_id), candidate_id: String(candidate_id) },
    });

    await pool.query(
      `INSERT INTO transactions
        (candidate_id, exam_id, amount, currency, status, razorpay_order_id, coupon_code, discount_amount)
       VALUES ($1,$2,$3,$4,'created',$5,$6,$7)`,
      [candidate_id, exam_id, amount, 'INR', order.id, appliedCoupon, discount_amount]
    );

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Could not create payment order', error: err.message });
  }
};

// Candidate: verify Razorpay signature after checkout widget completes, then register for the exam
exports.verifyPayment = async (req, res) => {
  const { exam_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const candidate_id = req.candidate.candidate_id;

  if (!exam_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment verification details' });
  }

  const client = await pool.connect();
  try {
    const txnResult = await client.query(
      `SELECT * FROM transactions WHERE razorpay_order_id = $1 AND candidate_id = $2 AND exam_id = $3`,
      [razorpay_order_id, candidate_id, exam_id]
    );
    if (txnResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found for this candidate' });
    }
    const txn = txnResult.rows[0];

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await client.query(
        `UPDATE transactions SET status = 'failed', razorpay_payment_id = $1, updated_at = NOW() WHERE transaction_id = $2`,
        [razorpay_payment_id, txn.transaction_id]
      );
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE transactions
       SET status = 'success', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = NOW()
       WHERE transaction_id = $3`,
      [razorpay_payment_id, razorpay_signature, txn.transaction_id]
    );

    const existingReg = await client.query(
      'SELECT registration_id FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (existingReg.rows.length === 0) {
      await client.query(
        `INSERT INTO exam_registrations (candidate_id, exam_id) VALUES ($1, $2)`,
        [candidate_id, exam_id]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Payment verified and exam registration confirmed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while verifying payment', error: err.message });
  } finally {
    client.release();
  }
};

// Admin: list all transactions
exports.listAllTransactions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.transaction_id, t.amount, t.currency, t.status, t.razorpay_order_id,
              t.razorpay_payment_id, t.coupon_code, t.discount_amount, t.created_at,
              c.full_name AS candidate_name, c.mobile_number, c.email,
              e.exam_name
       FROM transactions t
       JOIN candidates c ON c.candidate_id = t.candidate_id
       JOIN exams e ON e.exam_id = t.exam_id
       ORDER BY t.created_at DESC`
    );
    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: revenue + transaction summary for dashboard
exports.paymentSummary = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'success') AS successful_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS total_revenue
       FROM transactions`
    );
    res.json({ success: true, summary: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: mark a successful transaction as refunded (manual bookkeeping;
// trigger the actual refund from the Razorpay dashboard/API separately)
exports.refundTransaction = async (req, res) => {
  const { transaction_id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE transactions SET status = 'refunded', updated_at = NOW()
       WHERE transaction_id = $1 AND status = 'success' RETURNING *`,
      [transaction_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No successful transaction found with this id' });
    }
    res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
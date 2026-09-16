const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyCandidate, verifyAdmin } = require('../middleware/auth');

// Candidate: pay for an exam
router.post('/create-order', verifyCandidate, paymentController.createOrder);
router.post('/verify', verifyCandidate, paymentController.verifyPayment);

// Admin: view transactions
router.get('/admin/all', verifyAdmin, paymentController.listAllTransactions);
router.get('/admin/summary', verifyAdmin, paymentController.paymentSummary);
router.post('/admin/:transaction_id/refund', verifyAdmin, paymentController.refundTransaction);

module.exports = router;
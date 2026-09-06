const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const { verifyCandidate, verifyAdmin } = require('../middleware/auth');

router.post('/start', verifyCandidate, attemptController.startAttempt);
router.post('/:attempt_id/submit', verifyCandidate, attemptController.submitAttempt);
router.get('/:attempt_id/result', verifyCandidate, attemptController.getResult);

// Admin: subjective evaluation
router.get('/pending-evaluation', verifyAdmin, attemptController.listPendingEvaluations);
router.get('/:attempt_id/evaluate', verifyAdmin, attemptController.getAttemptForEvaluation);
router.post('/:attempt_id/evaluate', verifyAdmin, attemptController.evaluateAttempt);

module.exports = router;
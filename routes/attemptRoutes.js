const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const { verifyCandidate, verifyAdmin } = require('../middleware/auth');

router.post('/start', verifyCandidate, attemptController.startAttempt);
router.post('/:attempt_id/save-progress', verifyCandidate, attemptController.saveProgress);
router.post('/:attempt_id/submit', verifyCandidate, attemptController.submitAttempt);
router.get('/:attempt_id/result', verifyCandidate, attemptController.getResult);
router.get('/:attempt_id/result/pdf', verifyCandidate, attemptController.getResultPdf);

// Admin: subjective evaluation
router.get('/pending-evaluation', verifyAdmin, attemptController.listPendingEvaluations);
router.get('/:attempt_id/evaluate', verifyAdmin, attemptController.getAttemptForEvaluation);
router.post('/:attempt_id/evaluate', verifyAdmin, attemptController.evaluateAttempt);

module.exports = router;
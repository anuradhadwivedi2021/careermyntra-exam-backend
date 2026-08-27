const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const { verifyCandidate } = require('../middleware/auth');

router.post('/start', verifyCandidate, attemptController.startAttempt);
router.post('/:attempt_id/submit', verifyCandidate, attemptController.submitAttempt);
router.get('/:attempt_id/result', verifyCandidate, attemptController.getResult);

module.exports = router;
const express = require('express');
const router = express.Router();
const proctoringController = require('../controllers/proctoringController');
const { verifyAdmin, verifyCandidate } = require('../middleware/auth');

// Candidate: log a security event during the exam (tab switch, fullscreen exit, no face, etc.)
router.post('/events', verifyCandidate, proctoringController.logEvent);

// Candidate: submit a webcam photo capture
router.post('/captures', verifyCandidate, proctoringController.submitCapture);

// Candidate: submit ID document + selfie for verification
router.post('/id-verification', verifyCandidate, proctoringController.submitIdVerification);

// Candidate: check my own ID verification status for an attempt (used on resume/reload)
router.get('/id-verification/status/:attempt_id', verifyCandidate, proctoringController.getMyIdVerificationStatus);

// Admin: full proctoring review for one attempt (events + captures + ID verification)
router.get('/attempts/:attempt_id', verifyAdmin, proctoringController.getAttemptProctoring);

// Admin: list attempts with suspicious-activity events
router.get('/flagged', verifyAdmin, proctoringController.getFlaggedAttempts);

// Admin: approve/reject an ID verification
router.put('/id-verification/:verification_id', verifyAdmin, proctoringController.reviewIdVerification);

// Admin: turn proctoring on/off (and configure it) for an exam
router.put('/exams/:exam_id/settings', verifyAdmin, proctoringController.updateExamProctoringSettings);

module.exports = router;
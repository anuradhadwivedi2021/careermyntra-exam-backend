const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');
const { verifyCandidate, verifyAdmin } = require('../middleware/auth');

router.post('/', verifyCandidate, registrationController.registerForExam);
router.get('/my', verifyCandidate, registrationController.myRegistrations);
router.get('/pending', verifyAdmin, registrationController.pendingRegistrations);
router.get('/exam/:exam_id', verifyAdmin, registrationController.examRegistrations);
router.post('/:registration_id/approve', verifyAdmin, registrationController.approveRegistration);
router.post('/:registration_id/reject', verifyAdmin, registrationController.rejectRegistration);

// Admit card (PDF) — candidate downloads their own, admin can download any candidate's
router.get('/:exam_id/admit-card', verifyCandidate, registrationController.downloadAdmitCard);
router.get('/:registration_id/admit-card/admin', verifyAdmin, registrationController.downloadAdmitCardAdmin);

module.exports = router;
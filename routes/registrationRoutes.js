const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');
const { verifyCandidate, verifyAdmin } = require('../middleware/auth');

router.post('/', verifyCandidate, registrationController.registerForExam);
router.get('/my', verifyCandidate, registrationController.myRegistrations);
router.get('/exam/:exam_id', verifyAdmin, registrationController.examRegistrations);

module.exports = router;
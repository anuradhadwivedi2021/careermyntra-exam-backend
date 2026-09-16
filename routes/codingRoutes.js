const express = require('express');
const router = express.Router();
const codingController = require('../controllers/codingController');
const { verifyAdmin, verifyCandidate } = require('../middleware/auth');

// Candidate: run code against visible/sample test cases only
router.post('/run', verifyCandidate, codingController.runCode);

router.get('/test-cases/:question_id', verifyAdmin, codingController.listTestCases);
router.post('/test-cases', verifyAdmin, codingController.addTestCase);
router.put('/test-cases/:test_case_id', verifyAdmin, codingController.updateTestCase);
router.delete('/test-cases/:test_case_id', verifyAdmin, codingController.deleteTestCase);

module.exports = router;
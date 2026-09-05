const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { verifyAdmin } = require('../middleware/auth');

router.post('/', verifyAdmin, questionController.addQuestion);
router.get('/exam/:exam_id', questionController.getQuestionsByExam);

module.exports = router;
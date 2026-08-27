const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');

router.post('/', questionController.addQuestion);
router.get('/exam/:exam_id', questionController.getQuestionsByExam);

module.exports = router;
const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');

router.post('/', examController.createExam);
router.get('/', examController.listExams);
router.get('/:exam_id', examController.getExamById);

module.exports = router;
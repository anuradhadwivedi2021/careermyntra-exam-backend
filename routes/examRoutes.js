const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { verifyAdmin } = require('../middleware/auth');

router.post('/', verifyAdmin, examController.createExam);
router.get('/', examController.listExams);
router.get('/admin/all', verifyAdmin, examController.listAllExamsForAdmin);
router.get('/:exam_id', examController.getExamById);

module.exports = router;
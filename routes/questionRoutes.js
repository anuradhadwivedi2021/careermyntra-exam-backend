const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { verifyAdmin } = require('../middleware/auth');
const { uploadSpreadsheet } = require('../middleware/uploadSpreadsheet');

router.post('/', verifyAdmin, questionController.addQuestion);
router.post('/bulk', verifyAdmin, questionController.bulkAddQuestions);
router.post('/bulk-upload', verifyAdmin, uploadSpreadsheet.single('file'), questionController.bulkUploadQuestions);
router.get('/bulk-template', verifyAdmin, questionController.downloadBulkTemplate);
router.get('/exam/:exam_id', questionController.getQuestionsByExam);
router.get('/:question_id', verifyAdmin, questionController.getQuestionByIdAdmin);
router.put('/:question_id', verifyAdmin, questionController.updateQuestion);
router.delete('/:question_id', verifyAdmin, questionController.deleteQuestion);

module.exports = router;
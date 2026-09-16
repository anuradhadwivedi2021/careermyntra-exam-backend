const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/exam/:exam_id', reportController.examReport);
router.get('/exam/:exam_id/export', verifyAdmin, reportController.exportExamReport);
router.get('/exam/:exam_id/export-pdf', verifyAdmin, reportController.examReportPdf);
router.get('/exam/:exam_id/questions', verifyAdmin, reportController.questionReport);
router.get('/student/:candidate_id', reportController.studentReport);
router.get('/student/:candidate_id/export', verifyAdmin, reportController.exportStudentReport);
router.get('/dashboard', verifyAdmin, reportController.dashboardStats);

module.exports = router;
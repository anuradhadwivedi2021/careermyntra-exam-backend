const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/exam/:exam_id', reportController.examReport);
router.get('/student/:candidate_id', reportController.studentReport);
router.get('/dashboard', reportController.dashboardStats);

module.exports = router;
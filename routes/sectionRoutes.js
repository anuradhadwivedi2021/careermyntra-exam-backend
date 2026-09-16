const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');
const { verifyAdmin } = require('../middleware/auth');

// Public (candidate + admin both hit this — no auth needed to just view names)
router.get('/exam/:exam_id', sectionController.listSections);

// Admin only
router.post('/exam/:exam_id', verifyAdmin, sectionController.createSection);
router.put('/:section_id', verifyAdmin, sectionController.updateSection);
router.delete('/:section_id', verifyAdmin, sectionController.deleteSection);
router.put('/question/:question_id/assign', verifyAdmin, sectionController.assignQuestionSection);

module.exports = router;
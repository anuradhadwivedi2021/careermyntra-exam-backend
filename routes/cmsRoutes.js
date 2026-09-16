const express = require('express');
const router = express.Router();
const cmsController = require('../controllers/cmsController');
const { verifyAdmin } = require('../middleware/auth');

// Public / admin-list: all sections
router.get('/', cmsController.getAllSections);

// Public: one section (for rendering the live site later)
router.get('/:section_id', cmsController.getSection);

// Admin: update a section
router.put('/:section_id', verifyAdmin, cmsController.updateSection);

// Admin: create/delete custom sections
router.post('/', verifyAdmin, cmsController.addSection);
router.delete('/:section_id', verifyAdmin, cmsController.deleteSection);

module.exports = router;
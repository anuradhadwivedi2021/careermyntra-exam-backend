const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { verifyAdmin } = require('../middleware/auth');

// Public: anyone can submit the contact form
router.post('/', contactController.submitMessage);

// Admin: view + manage messages
router.get('/admin/all', verifyAdmin, contactController.listMessages);
router.patch('/admin/:message_id/status', verifyAdmin, contactController.updateStatus);

module.exports = router;
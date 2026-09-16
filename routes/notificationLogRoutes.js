const express = require('express');
const router = express.Router();
const notificationLogController = require('../controllers/notificationLogController');
const { verifyAdmin } = require('../middleware/auth');

// Admin only — these logs can contain mobile numbers/emails, never public.
router.get('/sms', verifyAdmin, notificationLogController.listSmsLogs);
router.get('/email', verifyAdmin, notificationLogController.listEmailLogs);

module.exports = router;
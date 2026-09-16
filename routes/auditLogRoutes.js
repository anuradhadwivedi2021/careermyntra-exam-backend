const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { verifyAdmin } = require('../middleware/auth');

// Admin: list audit log entries (supports ?module=&admin=&search=&limit=)
router.get('/', verifyAdmin, auditLogController.getLogs);

module.exports = router;
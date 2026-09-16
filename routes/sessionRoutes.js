const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/', verifyAdmin, sessionController.listSessions);
router.get('/attempt/:attempt_id', verifyAdmin, sessionController.getAttemptSecurityInfo);

module.exports = router;
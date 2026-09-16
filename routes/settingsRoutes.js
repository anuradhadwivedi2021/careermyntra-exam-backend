const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/', settingsController.getSettings);
router.put('/general', verifyAdmin, settingsController.updateGeneral);
router.put('/branding', verifyAdmin, settingsController.updateBranding);

module.exports = router;
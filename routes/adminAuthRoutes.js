const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { verifyAdmin, requireSuperAdmin } = require('../middleware/auth');

// Only an already-logged-in super admin can create another admin account.
// (For the very first admin on a fresh database, use scripts/create-super-admin.js instead.)
router.post('/register', verifyAdmin, requireSuperAdmin, adminAuthController.registerAdmin);
router.post('/login', adminAuthController.loginAdmin);

module.exports = router;
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { verifyAdmin } = require('../middleware/auth');

// Admin: list all roles with their permission matrix + admin counts
router.get('/', verifyAdmin, roleController.getAllRoles);

// Admin: create a new role
router.post('/', verifyAdmin, roleController.createRole);

// Admin: update a role's module access
router.put('/:role_id/permissions', verifyAdmin, roleController.updatePermissions);

module.exports = router;
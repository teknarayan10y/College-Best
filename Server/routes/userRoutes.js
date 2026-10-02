const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { updateUserRole } = require('../controller/userController');

const router = express.Router();
router.patch('/:id/role', requireAuth, requireRole('admin'), updateUserRole);

module.exports = router;
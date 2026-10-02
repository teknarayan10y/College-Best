const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { createFaculty, listFaculty, getFacultyProfile, updateFacultyProfile, updateUserStatus } = require('../controller/adminFacultyController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.post('/', createFaculty);
router.get('/', listFaculty);
router.get('/:userId/profile', getFacultyProfile);
router.patch('/:userId/profile', updateFacultyProfile);
router.patch('/:userId/status', updateUserStatus);

module.exports = router;
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { myMarks } = require('../controller/studentMarksController');

router.use(requireAuth, requireRole('student'));

// GET /api/student/marks
router.get('/', myMarks);

module.exports = router;

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { getStudentExamMarks } = require('../controller/studentExamController');

router.use(requireAuth, requireRole('student'));

// GET /api/student/exams/marks?semester=all|1|2...
router.get('/marks', getStudentExamMarks);

// GET /api/student/exams (alias)
router.get('/', getStudentExamMarks);

module.exports = router;

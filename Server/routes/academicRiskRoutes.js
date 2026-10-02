const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const {
  getStudentAcademicRisk,
  getCourseAcademicRiskForFaculty
} = require('../controller/academicRiskController');

const router = express.Router();
router.use(requireAuth);

// Student risk analysis for all subjects
router.get('/student', requireRole('student'), getStudentAcademicRisk);

// Faculty risk analysis for students in a course
router.get('/faculty/:courseId', requireRole('faculty'), getCourseAcademicRiskForFaculty);

module.exports = router;

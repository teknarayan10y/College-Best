// routes/dashboardRoutes.js
const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { getStudentData, getFacultyData, getStudentCourses, getDigitalTwinSummary } = require('../controller/dashboardController');

const router = express.Router();

router.get('/student-data', requireAuth, requireRole('student'), getStudentData);
router.get('/faculty-data', requireAuth, requireRole('faculty'), getFacultyData);
router.get('/student-courses', requireAuth, requireRole('student'), getStudentCourses);
router.get('/digital-twin', requireAuth, getDigitalTwinSummary);

module.exports = router;
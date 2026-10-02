const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { facultyMyCourses } = require('../controller/facultyCoursesController');
 // or your new controller

const router = express.Router();
router.use(requireAuth, requireRole('faculty'));

router.get('/courses', facultyMyCourses);

module.exports = router;
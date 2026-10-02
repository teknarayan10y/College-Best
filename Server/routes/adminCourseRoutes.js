// Server/routes/adminCourseRoutes.js
const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
} = require('../controller/adminCourseController');

const router = express.Router();

// Admin-only protection
router.use(requireAuth, requireRole('admin'));

// List and Create
router.get('/', listCourses);
router.post('/', createCourse);

// Read one, Update, Delete
router.get('/:courseId', getCourse);
router.patch('/:courseId', updateCourse);
router.delete('/:courseId', deleteCourse);

module.exports = router;
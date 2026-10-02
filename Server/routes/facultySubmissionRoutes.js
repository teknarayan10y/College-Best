const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { listForAssignmentByFaculty } = require('../controller/studentSubmissionController');

const router = express.Router();

router.use(requireAuth, requireRole('faculty'));

/**
 * ✅ FINAL, CLEAR, REST-SAFE ROUTE
 * GET /api/faculty/assignments/:assignmentId/submissions
 */
router.get(
  '/:assignmentId/submissions',
  listForAssignmentByFaculty
);

module.exports = router;

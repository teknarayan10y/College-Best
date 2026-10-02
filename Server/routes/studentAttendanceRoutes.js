const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const ctrl = require('../controller/studentAttendanceController');

router.use(requireAuth, requireRole('student'));

// GET /api/student/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
// or ?date=YYYY-MM-DD&session=FN|AN
router.get('/', ctrl.myAttendance);

// GET /api/student/attendance/trends (Predictive 75% analysis, trajectory, & recovery metrics)
router.get('/trends', ctrl.myAttendanceTrends);

module.exports = router;
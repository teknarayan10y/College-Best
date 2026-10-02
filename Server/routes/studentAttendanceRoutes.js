const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const ctrl = require('../controller/studentAttendanceController');

router.use(requireAuth, requireRole('student'));

// GET /api/student/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
// or ?date=YYYY-MM-DD&session=FN|AN
router.get('/', ctrl.myAttendance);

module.exports = router;
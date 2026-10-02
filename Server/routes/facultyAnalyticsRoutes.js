const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const ctrl = require('../controller/facultyAnalyticsController');

router.use(requireAuth, requireRole('faculty'));

router.get('/today', ctrl.today);
router.get('/subject-summary', ctrl.subjectSummary);
router.get('/recent', ctrl.recent);

module.exports = router;
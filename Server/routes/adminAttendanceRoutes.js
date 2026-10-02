const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const ctrl = require('../controller/adminAttendanceController');

router.use(requireAuth, requireRole('admin'));
router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.post('/mark-session', ctrl.markSession);
router.post('/bulk-day', ctrl.bulkDay);
router.post('/ai-scan-photo', ctrl.aiScanPhoto);
router.post('/ai-scan-voice', ctrl.aiScanVoice);

module.exports = router;
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const studentAiCtrl = require('../controller/studentAiController');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/student/ai/chat
router.post('/chat', requireAuth, requireRole('student'), upload.single('file'), studentAiCtrl.chatWithStudentAi);

module.exports = router;

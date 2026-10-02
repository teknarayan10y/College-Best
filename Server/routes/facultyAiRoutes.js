const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const facultyAiCtrl = require('../controller/facultyAiController');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/faculty/ai/chat
router.post('/chat', requireAuth, requireRole('faculty'), upload.single('file'), facultyAiCtrl.chatWithFacultyAi);

module.exports = router;

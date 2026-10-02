const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const adminAiCtrl = require('../controller/adminAiController');
const multer = require('multer');

// Accept optional file attachment (ChatGPT-style file Q&A)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/admin/ai/chat
router.post('/chat', requireAuth, requireRole('admin'), upload.single('file'), adminAiCtrl.chatWithAdminAi);

module.exports = router;

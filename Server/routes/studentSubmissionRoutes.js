const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ctrl = require('../controller/studentSubmissionController');

const router = express.Router();

// Ensure uploads dir
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const allowed = new Set([
  'video/mp4', 'video/mpeg', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
  'application/pdf',
  'image/jpeg', 'image/png', 'image/jpg', 'image/webp',
  'text/plain', 'text/markdown'
]);
const fileFilter = (req, file, cb) => allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'), false);
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB/file
    files: 20,
    parts: 2000,
    fields: 1000
  }
});

router.use(requireAuth, requireRole('student'));

// POST submit
router.post('/:assignmentId/submissions', upload.array('files', 20), ctrl.create);
// GET my submission for assignment
router.get('/:assignmentId/submissions/me', ctrl.listMineForAssignment);

// Multer errors
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File too large. Max 1GB per file.' });
  if (err && err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ message: 'Too many files. Max 20 files.' });
  next(err);
});

module.exports = router;
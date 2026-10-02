// Server/routes/assignmentRoutes.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const ctrl = require('../controller/assignmentController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

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
  'image/jpeg', 'image/png', 'image/jpg',
  'text/plain', 'text/markdown'
]);

const fileFilter = (req, file, cb) => {
  if (allowed.has(file.mimetype)) cb(null, true);
  else cb(new Error('File type not allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB per file (adjust as needed)
    fieldSize: 20 * 1024 * 1024,  // 20MB text fields
    files: 20,                     // allow up to 20 files
    parts: 2000,                   // total parts (fields + files)
    fields: 1000                   // non-file fields
  }
});

router.use(requireAuth, requireRole('faculty'));

// Create assignment (multipart form: title, description, courseId, dueDate, files[])
// Server/routes/assignmentRoutes.js
// ...
router.use(requireAuth, requireRole('faculty'));

// Create assignment (multipart form: title, description, courseId, dueDate, files[])
router.post('/', upload.array('files', 20), ctrl.create);

// Keep the GET below
router.get('/', ctrl.listMine);

// Add a router-level Multer error handler for friendly messages
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File too large. Max 1GB per file.' });
  }
  if (err && err.code === 'LIMIT_FIELD_SIZE') {
    return res.status(413).json({ message: 'Text field too large. Max 20MB.' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ message: 'Too many files. Max 20 files.' });
  }
  next(err);
});
// List my assignments
router.get('/', ctrl.listMine);

// (Optional) Single assignment
// router.get('/:id', ctrl.getOne);

module.exports = router;
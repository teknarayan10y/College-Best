const express = require('express');
const requireAuth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getProfile, updateProfile } = require('../controller/facultyProfileController');

const router = express.Router();

// allowed types
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `faculty_${req.user.sub}_${Date.now()}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error('Invalid image type. Allowed: JPG, PNG, WEBP, GIF'));
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', requireAuth, getProfile);
router.put('/', requireAuth, upload.single('profileImage'), updateProfile);

module.exports = router;
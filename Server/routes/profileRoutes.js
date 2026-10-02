const express = require('express');
const requireAuth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { getProfile, updateProfile, enrollBiometrics } = require('../controller/profileController');

const router = express.Router();

// Allowed mime types and extensions
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `profile_${req.user.sub}_${Date.now()}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const okMime = ALLOWED_MIME.has(file.mimetype);
  const okExt = ALLOWED_EXT.has(ext);
  if (okMime && okExt) return cb(null, true);
  cb(new Error('Invalid image type. Allowed: JPG, PNG, WEBP, GIF'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 2 MB
});
// GET JSON
router.get('/', requireAuth, getProfile);

// PUT multipart (file + fields)
router.put('/', requireAuth, upload.single('profileImage'), updateProfile);

// POST biometrics enrollment (FaceID + Voice)
router.post('/biometrics', requireAuth, enrollBiometrics);

module.exports = router;
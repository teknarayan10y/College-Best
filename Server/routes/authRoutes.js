const express = require('express');
const requireAuth = require('../middleware/auth');
const { signup, login, refresh, faceLogin } = require('../controller/authController');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/face-login', faceLogin);
router.post('/refresh', requireAuth, refresh);

module.exports = router;
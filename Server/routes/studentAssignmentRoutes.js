const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { listForStudent } = require('../controller/assignmentController');

const router = express.Router();

router.get('/', requireAuth, requireRole('student'), listForStudent);

module.exports = router;
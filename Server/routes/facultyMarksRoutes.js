// Server/routes/facultyMarksRoutes.js
const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { facultyGetMarks, facultySaveMarks, facultyDeleteMarks, facultyAiMarkEntry } = require('../controller/facultyMarksController');

const router = express.Router();
router.use(requireAuth, requireRole('faculty'));

router.get('/marks/:courseId', facultyGetMarks);
router.post('/marks', facultySaveMarks);
router.delete('/marks/:courseId/:studentId', facultyDeleteMarks);
router.post('/marks/ai-entry', facultyAiMarkEntry);

module.exports = router;

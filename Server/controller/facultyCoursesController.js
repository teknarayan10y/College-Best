// Server/controller/facultyCoursesController.js
const Course = require('../models/Course');

// GET /api/faculty/courses
async function facultyMyCourses(req, res) {
  try {
    const user = req.user || {};
    const facultyId = user.id || user._id; // support both shapes from auth middleware
    if (!facultyId) return res.status(401).json({ message: 'Unauthorized' });

    const rows = await Course.find({ faculty: facultyId })
      .select('code name department semester credits isActive section joinCode')
      .sort({ semester: 1, code: 1 })
      .lean();

    console.log('Found courses for faculty:', facultyId, rows);

    // Add missing fields with default values
    const processedRows = rows.map(course => {
      const cCode = course.code || course.name?.replace(/\s+/g, '').substring(0, 6).toUpperCase() + (course.semester || 1) + '01';
      return {
        ...course,
        code: cCode,
        joinCode: course.joinCode || `${cCode}-${(course.section || 'A').toUpperCase()}`,
        credits: course.credits || 4
      };
    });

    console.log('Processed courses with defaults:', processedRows);
    console.log('Response being sent:', { courses: processedRows });

    return res.json({ courses: processedRows });
  } catch (e) {
    console.error('facultyMyCourses error:', e);
    return res.status(500).json({ message: 'Failed to load courses' });
  }
}

module.exports = { facultyMyCourses };
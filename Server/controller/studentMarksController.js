const Marks = require('../models/Marks');

// GET /api/student/marks
async function myMarks(req, res) {
  try {
    const userId = req.user?.sub || req.user?.id;
    const docs = await Marks.find({ studentId: userId, isActive: true })
      .populate('courseId', 'name code semester credits department')
      .populate('facultyId', 'name firstName lastName email')
      .sort({ semester: 1, updatedAt: -1 })
      .lean();

    const items = docs.map((m) => {
      const c = m.courseId || {};
      const f = m.facultyId || {};
      const facultyName = `${f.firstName || ''} ${f.lastName || ''}`.trim() || f.name || f.email || '-';
      return {
        _id: m._id,
        courseId: c._id || null,
        courseName: c.name || 'Course',
        courseCode: c.code || '',
        credits: c.credits || 0,
        semester: m.semester || c.semester || null,
        academicYear: m.academicYear,
        facultyName,
        semesterExam: m.semesterExam ?? 0,
        assignment: m.assignment ?? 0,
        practical: m.practical ?? 0,
        total: m.total ?? 0,
        grade: m.grade || 'F',
        updatedAt: m.updatedAt
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('studentMyMarks error:', error);
    return res.status(500).json({ message: 'Failed to load marks' });
  }
}

module.exports = { myMarks };

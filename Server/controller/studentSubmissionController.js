// Server/controller/studentSubmissionController.js
const path = require('path');
const StudentSubmission = require('../models/StudentSubmission');
const Assignment = require('../models/Assignment');
const StudentProfile = require('../models/StudentProfile');
const Course = require('../models/Course');

// Helper: get course IDs available to the student based on profile (branch/semester)
async function getStudentCourseIds(userId) {
  const profile = await StudentProfile.findOne({ user: userId }).lean();
  if (!profile) return [];
  const semesterParam = ''; // use profile’s semester by default
  let semesterNum = Number(profile.semester) || 0;
  const department = (profile.branch || '').trim();
  const q = {};
  if (semesterParam !== 'all' && semesterNum) q.semester = semesterNum;
  if (department) q.department = department;
  const courses = await Course.find(q).select('_id').lean();
  return courses.map(c => c._id);
}

// POST /api/student/assignments/:assignmentId/submissions
// Create or replace a student's submission for an assignment
exports.create = async (req, res, next) => {
  try {
    const userId = req.user?.sub || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { assignmentId } = req.params;
    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    // Ensure this student is eligible for the assignment via their course list
    const allowedCourses = await getStudentCourseIds(userId);
    if (!allowedCourses.find(id => String(id) === String(assignment.courseId))) {
      return res.status(403).json({ message: 'Not allowed for this assignment' });
    }

    const files = (req.files || []).map(f => ({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      path: f.path.replace(/\\/g, '/'),
      url: `/uploads/${path.basename(f.path)}`,
    }));

    const payload = {
      assignment: assignment._id,
      student: userId,
      note: req.body?.note || '',
      files,
      submittedAt: new Date(),
    };

    // Upsert behavior: replace previous submission if exists
    const doc = await StudentSubmission.findOneAndUpdate(
      { assignment: assignment._id, student: userId },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ item: doc });
  } catch (e) { next(e); }
};

// GET /api/student/assignments/:assignmentId/submissions/me
// Return the logged-in student's submission (if any) for an assignment
exports.listMineForAssignment = async (req, res, next) => {
  try {
    const userId = req.user?.sub || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { assignmentId } = req.params;

    const doc = await StudentSubmission.findOne({ assignment: assignmentId, student: userId }).lean();
    return res.json({ item: doc || null });
  } catch (e) { next(e); }
};

// GET /api/faculty/assignments/:assignmentId/submissions
// Faculty-only: list submissions for an assignment the faculty owns
exports.listForAssignmentByFaculty = async (req, res, next) => {
  try {
    const facultyId = req.user?._id;
    if (!facultyId) return res.status(401).json({ message: 'Unauthorized' });
 console.log('[listForAssignmentByFaculty]', String(req.user?._id), req.params.assignmentId);
    const { assignmentId } = req.params;

    // Find assignment first and check ownership
    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    if (String(assignment.faculty) !== String(facultyId)) {
      return res.status(403).json({ message: 'Forbidden: not your assignment' });
    }

    const subs = await StudentSubmission.find({ assignment: assignmentId })
      .populate({ path: 'student', select: 'firstName lastName name email' })
      .sort({ submittedAt: -1 })
      .lean();

    const items = subs.map(s => {
      const u = s.student || {};
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.email || '-';
      return {
        _id: s._id,
        studentId: u._id,
        studentName: name,
        submittedAt: s.submittedAt,
        note: s.note || '',
        files: s.files || [],
      };
    });

    res.json({ assignment: { _id: assignment._id, title: assignment.title }, items });
  } catch (e) { next(e); }
};
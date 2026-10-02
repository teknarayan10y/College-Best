// Server/controller/assignmentController.js
const path = require('path');
const Assignment = require('../models/Assignment');
const StudentProfile = require('../models/StudentProfile');
const Course = require('../models/Course');

// Create a new assignment (faculty)
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { title, description, courseId, dueDate } = body;

    if (!title || !courseId) {
      return res.status(400).json({ message: 'title and courseId are required' });
    }

    const files = (req.files || []).map(f => ({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      path: f.path.replace(/\\/g, '/'),
      url: `/uploads/${path.basename(f.path)}`,
    }));

    const doc = await Assignment.create({
      faculty: req.user._id,
      courseId,
      title,
      description: description || '',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      files,
    });

    res.status(201).json({ item: doc });
  } catch (e) { next(e); }
};

// List assignments created by the logged-in faculty
exports.listMine = async (req, res, next) => {
  try {
    const items = await Assignment.find({ faculty: req.user._id }).sort({ createdAt: -1 });
    res.json({ items });
  } catch (e) { next(e); }
};

// Get a single assignment created by the logged-in faculty
exports.getOne = async (req, res, next) => {
  try {
    const doc = await Assignment.findOne({ _id: req.params.id, faculty: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json({ item: doc });
  } catch (e) { next(e); }
};

// List assignments for the logged-in student across their courses
// Optional query: ?semester=all | 1..8
exports.listForStudent = async (req, res, next) => {
  try {
    const userId = req.user?.sub || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const profile = await StudentProfile.findOne({ user: userId }).lean();
    if (!profile) return res.json({ items: [] });

    const semesterParam = (req.query?.semester || '').trim();
    let semesterNum = Number(profile.semester) || 0;
    if (semesterParam && semesterParam !== 'all') {
      const s = Number(semesterParam);
      if (Number.isFinite(s) && s > 0) semesterNum = s;
    }

    const department = (profile.branch || '').trim();

    const courseQuery = {};
    if (semesterParam !== 'all' && semesterNum) courseQuery.semester = semesterNum;
    if (department) courseQuery.department = department;

    const courses = await Course.find(courseQuery).select('_id name code').lean();
    if (!courses.length) return res.json({ items: [] });

    const courseIds = courses.map(c => c._id);

    const items = await Assignment.find({ courseId: { $in: courseIds } })
      .populate({ path: 'faculty', select: 'firstName lastName name email' })
      .populate({ path: 'courseId', select: 'name code' })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = items.map(a => {
      const f = a.faculty;
      let facultyName = '-';
      if (f) {
        const combined = `${f.firstName || ''} ${f.lastName || ''}`.trim();
        facultyName = combined || f.name || f.email || '-';
      }
      return {
        ...a,
        facultyName,
        courseName: a.courseId?.name || a.courseId?.code || '',
      };
    });

    return res.json({ items: mapped });
  } catch (e) { next(e); }
};
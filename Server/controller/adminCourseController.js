// Server/controller/adminCourseController.js
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const FacultyProfile = require('../models/FacultyProfile');

async function createCourse(req, res) {
  try {
    const {
      code, name, department, credits, semester,
      faculty, description, isActive, section
    } = req.body || {};
    if (!code || !name) return res.status(400).json({ message: 'code and name are required' });

    const exists = await Course.findOne({ code: String(code).trim().toUpperCase() }).lean();
    if (exists) return res.status(409).json({ message: 'Course code already exists' });

    let facultyId = null;
    if (faculty) {
      try {
        const f = await User.findById(faculty, { role: 1, name: 1, firstName: 1, lastName: 1 }).lean();
        if (!f) return res.status(400).json({ message: 'Faculty user not found' });
        if (f.role !== 'faculty') return res.status(400).json({ message: 'Provided user is not faculty' });
        facultyId = f._id;
      } catch {
        return res.status(400).json({ message: 'Invalid faculty id' });
      }
    }

    const normSection = ['A','B','C'].includes(String(section || '').toUpperCase())
      ? String(section).toUpperCase()
      : '';

    const row = await Course.create({
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      department: department || '',
      credits: Number(credits) || 0,
      semester: Number(semester) || 1,
      section: normSection,
      faculty: facultyId,
      description: description || '',
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    let facultyName = null;
    if (facultyId) {
      const f = await User.findById(facultyId, { name: 1, firstName: 1, lastName: 1, email: 1 }).lean();
      facultyName = (f?.name) || `${f?.firstName || ''} ${f?.lastName || ''}`.trim() || null;
    }

    return res.status(201).json({ course: row, facultyName });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ message: 'Course code already exists' });
    }
    console.error('createCourse error:', e);
    return res.status(500).json({ message: 'Failed to create course' });
  }
}

async function listCourses(req, res) {
  try {
    const { department } = req.query || {};
    const where = {};
    if (department) where.department = department;

    const rows = await Course.find(where).sort({ code: 1 }).lean();

    // Collect only valid ObjectIds to avoid CastError
    const rawIds = rows.map(r => r.faculty).filter(Boolean);
    const validIds = rawIds
      .map(id => (typeof id === 'string' ? id : String(id)))
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    // Join basic user fields
    const users = validIds.length
      ? await User.find(
          { _id: { $in: validIds } },
          { name: 1, firstName: 1, lastName: 1, email: 1 }
        ).lean()
      : [];
    const byUser = new Map(users.map(u => [String(u._id), u]));

    // Join faculty profiles to get institute code (facultyId)
    const profs = validIds.length
      ? await FacultyProfile.find(
          { user: { $in: validIds } },
          { user: 1, facultyId: 1 }
        ).lean()
      : [];
    const profByUser = new Map(profs.map(p => [String(p.user), p]));

    const courses = rows.map(r => {
      let facultyName = null;
      let facultyEmail = null;
      let facultyCode = null;

      const fid = r.faculty ? String(r.faculty) : null;
      if (fid && mongoose.Types.ObjectId.isValid(fid)) {
        const u = byUser.get(fid);
        facultyName = (u?.name) || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || null;
        facultyEmail = u?.email || null;

        const p = profByUser.get(fid);
        facultyCode = p?.facultyId || null; // institute code like "Sb2432"
      }

      return {
        ...r,
        // Only expose facultyId if it’s a valid ObjectId
        facultyId: (fid && mongoose.Types.ObjectId.isValid(fid)) ? fid : null,
        facultyName,
        facultyEmail,
        facultyCode,
      };
    });

    return res.json({ courses });
  } catch (e) {
    console.error('listCourses error:', e);
    return res.status(500).json({ message: 'Failed to list courses' });
  }
}

// GET /api/admin/courses/:courseId
async function getCourse(req, res) {
  try {
    const { courseId } = req.params;
    const row = await Course.findById(courseId).lean();
    if (!row) return res.status(404).json({ message: 'Course not found' });
    return res.json({ course: row });
  } catch (e) {
    console.error('getCourse error:', e);
    return res.status(500).json({ message: 'Failed to get course' });
  }
}

// PATCH /api/admin/courses/:courseId
async function updateCourse(req, res) {
  try {
    const { courseId } = req.params;
    const allowed = [
      'code','name','department','credits','semester','faculty','description','isActive','section'
    ];
    const updates = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];

    if (updates.code) updates.code = String(updates.code).trim().toUpperCase();
    if (updates.credits !== undefined) updates.credits = Number(updates.credits) || 0;
    if (updates.semester !== undefined) updates.semester = Number(updates.semester) || 1;

    if (updates.section !== undefined) {
      const s = String(updates.section || '').toUpperCase();
      updates.section = ['A','B','C'].includes(s) ? s : '';
    }

    if (updates.faculty !== undefined) {
      if (updates.faculty) {
        const f = await User.findById(updates.faculty, { role:1 }).lean();
        if (!f) return res.status(400).json({ message: 'Faculty user not found' });
        if (f.role !== 'faculty') return res.status(400).json({ message: 'Provided user is not faculty' });
      } else {
        updates.faculty = null; // allow unassign
      }
    }

    const row = await Course.findByIdAndUpdate(courseId, updates, { new: true }).lean();
    if (!row) return res.status(404).json({ message: 'Course not found' });
    return res.json({ course: row });
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ message: 'Course code already exists' });
    console.error('updateCourse error:', e);
    return res.status(500).json({ message: 'Failed to update course' });
  }
}

// DELETE /api/admin/courses/:courseId
async function deleteCourse(req, res) {
  try {
    const { courseId } = req.params;
    const row = await Course.findByIdAndDelete(courseId).lean();
    if (!row) return res.status(404).json({ message: 'Course not found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('deleteCourse error:', e);
    return res.status(500).json({ message: 'Failed to delete course' });
  }
}

module.exports = { createCourse, listCourses, getCourse, updateCourse, deleteCourse };
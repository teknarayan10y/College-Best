const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;

const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const { matchClassPhotoFaces, matchVoiceRollCall } = require('../services/ai/pythonMlClient');

function normalizeDate(v, fallbackDaysAgo = 0) {
  if (!v || v === 'undefined' || v === 'null') {
    const d = new Date();
    d.setDate(d.getDate() - fallbackDaysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - fallbackDaysAgo);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function recomputeCounters(doc) {
  const s = Array.isArray(doc.dailySchedule) ? doc.dailySchedule : [];
  doc.totalClasses = s.length;
  doc.presentClasses = s.filter(x => x.status === 'PRESENT').length;
  doc.onDutyClasses = s.filter(x => x.status === 'ON-DUTY').length;
  doc.absentClasses = s.filter(x => x.status === 'ABSENT').length;
}

// GET /api/faculty/attendance
exports.myAttendance = async (req, res, next) => {
  try {
    const { from, to, date, session, academicYear, semester } = req.query;
    const q = { userId: req.user._id };
    if (date) q.date = normalizeDate(date);
    if (from) q.date = Object.assign(q.date || {}, { $gte: normalizeDate(from, 30) });
    if (to) q.date = Object.assign(q.date || {}, { $lte: normalizeDate(to, 0) });
    if (academicYear) q.academicYear = academicYear;
    if (semester) q.semester = semester;

    const items = await Attendance.find(q).sort({ date: -1 });
    const mapped = items.map(doc => {
      if (!session) return doc;
      const pick = (doc.dailySchedule || []).find(s => s.session === session);
      return Object.assign({}, doc.toObject(), { dailySchedule: pick ? [pick] : [] });
    });
    res.json({ items: mapped });
  } catch (e) {
    next(e);
  }
};

// GET /api/faculty/attendance/courses
exports.myCourses = async (req, res, next) => {
  try {
    const items = await Course.find({ faculty: req.user._id, isActive: true })
      .sort({ name: 1 })
      .select('name semester section department');
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

// GET /api/faculty/attendance/students?courseId=...
exports.courseStudents = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!courseId || !ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const course = await Course.findById(courseId).select('semester section department faculty');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    // Allow if the user is the assigned faculty, OR if faculty field is missing (fallback)
    if (course.faculty && String(course.faculty) !== String(req.user._id)) {
      console.log('[AiScan] Faculty mismatch: course.faculty =', course.faculty, 'req.user._id =', req.user._id);
      return res.status(403).json({ message: 'You are not the faculty for this course. Contact admin if incorrect.' });
    }

    const sem = course.semester;
    const sec = (course.section || '').toUpperCase();
    const dept = (course.department || '').toLowerCase();

    const profiles = await StudentProfile.find({}).lean();
    const passUserIds = [];
    for (const p of profiles) {
      const okSem = sem == null || String(p.semester) === String(sem);
      const okSec = !sec || (p.section || '').toUpperCase() === sec;
      const bran = (p.branch || p.department || '').toLowerCase();
      const okDept = !dept || bran === dept || dept.includes(bran) || bran.includes(dept);
      if (okSem && okSec && okDept && p.user) {
        passUserIds.push(p.user);
      }
    }

    if (!passUserIds.length) return res.json({ items: [] });

    const users = await User.find({ _id: { $in: passUserIds } })
      .select('firstName lastName email department faceDescriptor')
      .lean();

    const userById = new Map(users.map(u => [String(u._id), u]));
    const items = passUserIds.map(id => {
      const u = userById.get(String(id)) || null;
      const p = profiles.find(pr => String(pr.user) === String(id)) || null;
      return { user: u, profile: p };
    });

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

// POST /api/faculty/attendance/mark-student-session
// Constraints:
// - courseId required; faculty ownership enforced
// - subject is forced to course.name
// - only one entry per subject per date (session stored but does not create extra allocation)
exports.markStudentSession = async (req, res, next) => {
  try {
    const {
      studentId,
      date,
      session,
      status,
      subject, // ignored; overridden
      topic = '',
      academicYear = '2025-26',
      semester = 'Odd',
      courseId
    } = req.body;

    if (!studentId || !ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Invalid studentId' });
    }
    if (!date || !session || !status) {
      return res.status(400).json({ message: 'date, session, status required' });
    }
    if (!courseId || !ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'valid courseId required' });
    }

    const course = await Course.findById(courseId).select('name faculty');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (String(course.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed for this course' });
    }
    const normalizedSubject = (course.name || '').trim();

    const d = normalizeDate(date);
    let doc = await Attendance.findOne({ userId: studentId, date: d });
    if (!doc) {
      doc = new Attendance({ userId: studentId, date: d, academicYear, semester, dailySchedule: [] });
    } else {
      doc.academicYear = academicYear || doc.academicYear;
      doc.semester = semester || doc.semester;
    }

    // One entry per subject per day (ignore session for allocation uniqueness)
    const idx = doc.dailySchedule.findIndex(
      s => ((s.subject || '').trim().toLowerCase() === normalizedSubject.toLowerCase())
    );

    const entry = {
      session, // stored for reference
      status,
      subject: normalizedSubject,
      faculty: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
      topic,
      date: d
    };

    if (idx >= 0) {
      doc.dailySchedule[idx] = entry;
    } else {
      doc.dailySchedule.push(entry);
    }

    // Defensive: ensure no duplicate same-subject entries
    const seen = new Set();
    doc.dailySchedule = doc.dailySchedule.filter(s => {
      const key = (s.subject || '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    recomputeCounters(doc);
    await doc.save();
    res.json({ item: doc });
  } catch (e) {
    next(e);
  }
};

// POST /api/faculty/attendance/bulk-day
// For each student: subject is forced to course.name; upsert one entry per subject per day
exports.bulkDay = async (req, res, next) => {
  try {
    const { date, courseId, items = [], academicYear = '2025-26', semester = 'Odd' } = req.body;
    if (!date || !courseId || !ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'date and valid courseId required' });
    }

    const course = await Course.findById(courseId).select('name faculty');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (String(course.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed for this course' });
    }
    const normalizedSubject = (course.name || '').trim();

    const d = normalizeDate(date);
    let count = 0;
    for (const it of items) {
      const { studentId, session, status, topic = '' } = it;
      if (!studentId || !ObjectId.isValid(studentId) || !session || !status) continue;

      let doc = await Attendance.findOne({ userId: studentId, date: d });
      if (!doc) {
        doc = new Attendance({ userId: studentId, date: d, academicYear, semester, dailySchedule: [] });
      } else {
        doc.academicYear = academicYear || doc.academicYear;
        doc.semester = semester || doc.semester;
      }

      // Upsert by subject only (one allocation per subject per day)
      const idx = doc.dailySchedule.findIndex(
        s => ((s.subject || '').trim().toLowerCase() === normalizedSubject.toLowerCase())
      );

      const entry = {
        session, // stored for reference
        status,
        subject: normalizedSubject,
        faculty: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
        topic,
        date: d
      };

      if (idx >= 0) {
        doc.dailySchedule[idx] = entry;
      } else {
        doc.dailySchedule.push(entry);
      }

      // Defensive dedupe by subject
      const seen = new Set();
      doc.dailySchedule = doc.dailySchedule.filter(s => {
        const key = (s.subject || '').trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      recomputeCounters(doc);
      await doc.save();
      count++;
    }

    res.json({ ok: true, count });
  } catch (e) {
    next(e);
  }
};

// GET /api/faculty/attendance/day-status?date=YYYY-MM-DD&courseId=...&subject=...&session=FN|AN (session optional)
exports.dayStatus = async (req, res, next) => {
  try {
    const { date, session, courseId } = req.query;
    if (!date || !courseId) {
      return res.status(400).json({ message: 'date and courseId required' });
    }
    if (!ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    // Validate course and ownership
    const course = await Course.findById(courseId).select('semester section department faculty name');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (String(course.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed for this course' });
    }

    // Determine which students belong to this course (reuse courseStudents logic)
    const sem = course.semester;
    const sec = (course.section || '').toUpperCase();
    const dept = (course.department || '').toLowerCase();

    const profiles = await StudentProfile.find({}).lean();
    const passUserIds = [];
    for (const p of profiles) {
      const okSem = sem == null || String(p.semester) === String(sem);
      const okSec = !sec || (p.section || '').toUpperCase() === sec;
      const bran = (p.branch || p.department || '').toLowerCase();
      const okDept = !dept || bran === dept || dept.includes(bran) || bran.includes(dept);
      if (okSem && okSec && okDept && p.user) {
        passUserIds.push(p.user);
      }
    }

    if (!passUserIds.length) return res.json({ items: [] });

    // Load attendance for that date for those students
    const d = normalizeDate(date);
    const docs = await Attendance.find({
      userId: { $in: passUserIds },
      date: d
    }).lean();

    // Subject filter is required for accurate subject-wise fetch; default to course name
    const { subject: subjectParam } = req.query;
    const subjectFilter = (subjectParam || course.name || '').trim().toLowerCase();

    // Pick the single subject entry (session NOT used for allocation uniqueness)
    const items = [];
    for (const doc of docs) {
      const entry = (doc.dailySchedule || []).find(s =>
        ((s.subject || '').trim().toLowerCase() === subjectFilter)
      );
      if (!entry) continue;
      items.push({
        studentId: String(doc.userId),
        status: entry.status || '',
        subject: entry.subject || '',
        topic: entry.topic || ''
      });
    }

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

// POST /api/faculty/attendance/ai-scan-photo
// Classroom group photo face recognition
exports.aiScanPhoto = async (req, res, next) => {
  try {
    const { courseId, image, threshold = 0.35 } = req.body;
    if (!courseId || !image) {
      return res.status(400).json({ message: 'courseId and image are required' });
    }

    const course = await Course.findById(courseId).select('semester section department faculty name');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (String(course.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed for this course' });
    }

    const sem = course.semester;
    const sec = (course.section || '').toUpperCase();
    const dept = (course.department || '').toLowerCase();

    const profiles = await StudentProfile.find({}).lean();
    const candidates = [];

    for (const p of profiles) {
      const okSem = sem == null || String(p.semester) === String(sem);
      const okSec = !sec || (p.section || '').toUpperCase() === sec;
      const bran = (p.branch || p.department || '').toLowerCase();
      const okDept = !dept || bran === dept || dept.includes(bran) || bran.includes(dept);
      if (okSem && okSec && okDept && p.user) {
        candidates.push({
          studentId: String(p.user),
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Student',
          rollNo: p.rollNo || p.registerNumber || '',
          faceEmbedding: (() => {
            // Prefer Python-ML faceEmbedding (128-dim); fall back to face-api.js faceDescriptor (also 128-dim)
            if (Array.isArray(p.faceEmbedding) && p.faceEmbedding.some(v => v !== 0)) return p.faceEmbedding;
            if (Array.isArray(p.faceDescriptor) && p.faceDescriptor.length === 128) return p.faceDescriptor;
            return [];
          })()
        });
      }
    }

    console.log('[AiScan] Sending', candidates.length, 'candidates to ML service. Threshold:', threshold);
    const mlResult = await matchClassPhotoFaces(image, candidates, threshold);
    console.log('[AiScan] ML result:', mlResult ? JSON.stringify({facesDetected: mlResult.facesDetected, matchedCount: mlResult.matchedCount}) : 'null');
    if (!mlResult) {
      // Try with a longer timeout (retry once)
      const retryResult = await matchClassPhotoFaces(image, candidates, threshold);
      if (!retryResult) {
        return res.status(503).json({ 
          message: 'AI face recognition service timed out. The image may be too large. Please try a smaller/clearer photo.',
          detail: 'ML service at localhost:8000 returned no response'
        });
      }
      return res.json({
        success: true,
        courseName: course.name,
        totalEnrolled: candidates.length,
        facesDetected: retryResult.facesDetected || 0,
        matchedCount: retryResult.matchedCount || 0,
        matches: retryResult.matches || [],
        unmatchedFacesCount: retryResult.unmatchedFacesCount || 0
      });
    }

    res.json({
      success: true,
      courseName: course.name,
      totalEnrolled: candidates.length,
      facesDetected: mlResult.facesDetected || 0,
      matchedCount: mlResult.matchedCount || 0,
      matches: mlResult.matches || [],
      unmatchedFacesCount: mlResult.unmatchedFacesCount || 0
    });
  } catch (e) {
    next(e);
  }
};

// POST /api/faculty/attendance/ai-scan-voice
// Voice roll-call speaker identification
exports.aiScanVoice = async (req, res, next) => {
  try {
    const { courseId, audio, threshold = 0.55 } = req.body;
    if (!courseId || !audio) {
      return res.status(400).json({ message: 'courseId and audio are required' });
    }

    const course = await Course.findById(courseId).select('semester section department faculty name');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (String(course.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed for this course' });
    }

    const sem = course.semester;
    const sec = (course.section || '').toUpperCase();
    const dept = (course.department || '').toLowerCase();

    const profiles = await StudentProfile.find({}).lean();
    const candidates = [];

    for (const p of profiles) {
      const okSem = sem == null || String(p.semester) === String(sem);
      const okSec = !sec || (p.section || '').toUpperCase() === sec;
      const bran = (p.branch || p.department || '').toLowerCase();
      const okDept = !dept || bran === dept || dept.includes(bran) || bran.includes(dept);
      if (okSem && okSec && okDept && p.user && p.voiceEmbedding && p.voiceEmbedding.length > 0) {
        candidates.push({
          studentId: String(p.user),
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Student',
          voiceEmbedding: p.voiceEmbedding
        });
      }
    }

    const mlResult = await matchVoiceRollCall(audio, candidates, threshold);
    if (!mlResult) {
      return res.status(503).json({ message: 'AI ML service unavailable. Please ensure python ml_service is running.' });
    }

    res.json({
      success: true,
      matched: mlResult.matched || false,
      student: mlResult.student || null,
      confidence: mlResult.confidence || 0.0
    });
  } catch (e) {
    next(e);
  }
};
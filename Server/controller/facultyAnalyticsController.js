const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;
const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');

function normalizeDate(v) { const d = new Date(v); d.setHours(0,0,0,0); return d; }
function lc(s) { return (s || '').trim().toLowerCase(); }

async function resolveStudentsForFacultyCourse(courseId, userId) {
  const course = await Course.findById(courseId).select('semester section department faculty name');
  if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });
  if (String(course.faculty) !== String(userId)) throw Object.assign(new Error('Not allowed for this course'), { status: 403 });

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
    if (okSem && okSec && okDept && p.user) passUserIds.push(p.user);
  }
  return { course, studentIds: passUserIds };
}

exports.today = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date required' });

    // All faculty courses
    const courses = await Course.find({ faculty: req.user._id, isActive: true }).select('name semester section department');
    const d = normalizeDate(date);
    const subjectNameSet = new Set(courses.map(c => c.name));
    const lcSubjects = new Set([...subjectNameSet].map(lc));

    // Find all students across these courses
    const allStudents = new Set();
    for (const c of courses) {
      const { studentIds } = await resolveStudentsForFacultyCourse(c._id, req.user._id);
      for (const id of studentIds) allStudents.add(String(id));
    }
    const ids = [...allStudents];
    if (ids.length === 0) return res.json({ totals: { total: 0, present: 0, onDuty: 0, absent: 0, unmarked: 0, pct: 0 }, subjects: [] });

    const docs = await Attendance.find({ userId: { $in: ids }, date: d }).lean();

    const bySubject = new Map(); // subj -> { total,present,onDuty,absent }
    // Per student/day compute unmarked by subject later from counts vs roster size
    for (const doc of docs) {
      const seen = new Set(); // unique by subject per day
      for (const s of (doc.dailySchedule || [])) {
        const key = lc(s.subject);
        if (!lcSubjects.has(key)) continue;       // only subjects handled by this faculty
        if (seen.has(key)) continue;
        seen.add(key);

        const current = bySubject.get(key) || { subject: s.subject || '', total: 0, present: 0, onDuty: 0, absent: 0 };
        current.total += 1;
        if (s.status === 'PRESENT') current.present += 1;
        else if (s.status === 'ON-DUTY') current.onDuty += 1;
        else if (s.status === 'ABSENT') current.absent += 1;
        bySubject.set(key, current);
      }
    }

    // For “unmarked”, we approximate: total students per subject today minus (present+od+absent) observed.
    // If you want exact per-subject roster sizes, you can compute per-course roster sizes and map subject->course roster count.
    const subjects = [];
    for (const [k, v] of bySubject.entries()) {
      const marked = v.present + v.onDuty + v.absent;
      const unmarked = 0;
      const pct = v.total ? Math.round(((v.present + v.onDuty) / v.total) * 10000) / 100 : 0;
      subjects.push({ subject: v.subject || k, total: v.total, present: v.present, onDuty: v.onDuty, absent: v.absent, unmarked, pct });
    }

    // Totals (sum subjects)
    let T=0, P=0, OD=0, A=0, U=0;
    for (const s of subjects) { T+=s.total; P+=s.present; OD+=s.onDuty; A+=s.absent; U+=s.unmarked; }
    const totals = {
      total: T, present: P, onDuty: OD, absent: A, unmarked: U,
      pct: T ? Math.round(((P + OD) / T) * 10000) / 100 : 0
    };

    res.json({ totals, subjects });
  } catch (e) {
    next(e);
  }
};

exports.subjectSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: 'from, to required' });

    const courses = await Course.find({ faculty: req.user._id, isActive: true }).select('name');
    const lcSubjects = new Set(courses.map(c => lc(c.name)));

    const dFrom = normalizeDate(from);
    const dTo = normalizeDate(to);

    // Get all students across these courses (same approach as above, but coarse)
    const allStudents = new Set();
    for (const c of courses) {
      const { studentIds } = await resolveStudentsForFacultyCourse(c._id, req.user._id);
      for (const id of studentIds) allStudents.add(String(id));
    }
    const ids = [...allStudents];
    if (ids.length === 0) return res.json({ items: [] });

    const docs = await Attendance.find({
      userId: { $in: ids },
      date: { $gte: dFrom, $lte: dTo }
    }).lean();

    const acc = new Map(); // subj -> { total,present,onDuty,absent }
    for (const doc of docs) {
      const seen = new Set();
      for (const s of (doc.dailySchedule || [])) {
        const key = lc(s.subject);
        if (!lcSubjects.has(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);

        const v = acc.get(key) || { subject: s.subject || '', total: 0, present: 0, onDuty: 0, absent: 0 };
        v.total += 1;
        if (s.status === 'PRESENT') v.present += 1;
        else if (s.status === 'ON-DUTY') v.onDuty += 1;
        else if (s.status === 'ABSENT') v.absent += 1;
        acc.set(key, v);
      }
    }

    const items = [];
    for (const [k, v] of acc.entries()) {
      const pct = v.total ? Math.round(((v.present + v.onDuty) / v.total) * 10000) / 100 : 0;
      items.push({ subject: v.subject || k, total: v.total, present: v.present, onDuty: v.onDuty, absent: v.absent, pct });
    }
    items.sort((a, b) => a.subject.localeCompare(b.subject));
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

exports.recent = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    // Since attendance entries are embedded, we read last N days and flatten (simple but OK for now)
    const courses = await Course.find({ faculty: req.user._id, isActive: true }).select('name');
    const lcSubjects = new Set(courses.map(c => lc(c.name)));
    const since = new Date();
    since.setDate(since.getDate() - 14); // last 14 days window

    const docs = await Attendance.find({ date: { $gte: normalizeDate(since) } })
      .sort({ date: -1 })
      .limit(500)
      .lean();

    const feed = [];
    for (const d of docs) {
      for (const s of (d.dailySchedule || [])) {
        if (!lcSubjects.has(lc(s.subject))) continue;
        feed.push({
          at: d.updatedAt || d.createdAt || d.date,
          subject: s.subject || '',
          studentId: String(d.userId),
          status: s.status || '',
          topic: s.topic || ''
        });
      }
    }
    feed.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({ items: feed.slice(0, Number(limit) || 20) });
  } catch (e) {
    next(e);
  }
};
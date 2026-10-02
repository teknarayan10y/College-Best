const mongoose = require('mongoose');
const Marks = require('../models/Marks');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const { createNotification } = require('../controller/notificationController');

const NUM = '(\\d+(?:\\.\\d+)?)';
const SEP = '\\s*(?:marks?)?\\s*(?:[:=\\-]|is|as|of)?\\s*';

const EXAM_RE = new RegExp(`\\b(?:semester\\s*exam|sem\\s*exam|end\\s*sem(?:ester)?(?:\\s*exam)?|exam|see)${SEP}${NUM}`, 'i');
const PLAIN_SEMESTER_RE = new RegExp(`\\b(?:semester|sem)\\b(?!\\s*exam)\\s*(?:no\\.?|number)?${SEP}${NUM}`, 'i');
const ASSIGNMENT_RE = new RegExp(`\\b(?:assignments?|assign|asg)${SEP}${NUM}`, 'i');
const PRACTICAL_RE = new RegExp(`\\b(?:practicals?|partical|prac|lab)${SEP}${NUM}`, 'i');
const ROLL_RE = /\broll\s*(?:no\.?|number|num|#)?\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*)/i;
const WRITE_VERB_RE = /\b(enter|add|update|save|set|record|put|give|store|upload|change|mark)\b/i;
const QUESTION_RE = /^\s*(what|how|who|which|why|when|show|list|simulate|predict|is|are|did|does)\b|\bwhat\s*if\b/i;

const MAX_MARKS = { semesterExam: 60, assignment: 20, practical: 20 };
const FIELD_LABELS = { semesterExam: 'Semester Exam', assignment: 'Assignment', practical: 'Practical' };

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSegment(segment) {
  const fields = {};
  let semesterNo = null;

  const exam = segment.match(EXAM_RE);
  const plainSem = segment.match(PLAIN_SEMESTER_RE);
  if (exam) {
    fields.semesterExam = Number(exam[1]);
    if (plainSem) semesterNo = Number(plainSem[1]);
  } else if (plainSem) {
    fields.semesterExam = Number(plainSem[1]);
  }

  const asg = segment.match(ASSIGNMENT_RE);
  if (asg) fields.assignment = Number(asg[1]);
  const prac = segment.match(PRACTICAL_RE);
  if (prac) fields.practical = Number(prac[1]);

  const roll = segment.match(ROLL_RE);
  return { rollNo: roll ? roll[1] : null, fields, semesterNo };
}

function parseMarksCommand(message) {
  if (!message || QUESTION_RE.test(message)) return null;

  const segments = message
    .split(/\n|;|(?=\broll\b)/i)
    .map(s => s.trim())
    .filter(Boolean);

  const entries = [];
  let semesterNo = null;
  for (const seg of segments) {
    const parsed = parseSegment(seg);
    if (parsed.semesterNo != null) semesterNo = parsed.semesterNo;
    if (parsed.rollNo && Object.keys(parsed.fields).length) {
      entries.push({ rollNo: parsed.rollNo, fields: parsed.fields });
    }
  }

  if (!entries.length) return null;
  const hasExplicitRoll = /\broll\b/i.test(message);
  if (!hasExplicitRoll && !WRITE_VERB_RE.test(message)) return null;
  return { entries, semesterNo };
}

function studentBelongsToCourse(profile, course) {
  const sem = course.semester;
  const sec = (course.section || '').toUpperCase();
  const dept = (course.department || '').toLowerCase();
  const okSem = sem == null || String(profile.semester) === String(sem);
  const okSec = !sec || (profile.section || '').toUpperCase() === sec;
  const bran = (profile.branch || profile.department || profile.program || '').toLowerCase();
  const okDept = !dept || bran === dept || dept.includes(bran) || bran.includes(dept);
  return okSem && okSec && okDept;
}

function findMentionedCourse(message, courses) {
  const lower = message.toLowerCase();
  const byCode = courses.find(c => c.code && new RegExp(`\\b${escapeRegex(c.code.toLowerCase())}\\b`).test(lower));
  if (byCode) return byCode;
  const byName = courses
    .filter(c => c.name && lower.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  return byName[0] || null;
}

function studentName(profile) {
  const full = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  return full || profile.email || 'Student';
}

function courseLabel(course) {
  return course.code ? `${course.name} (${course.code})` : course.name;
}

async function findStudentByRoll(rollNo) {
  const exact = new RegExp(`^${escapeRegex(rollNo)}$`, 'i');
  return StudentProfile.findOne({
    $or: [{ rollNo: exact }, { registerNumber: exact }, { studentId: exact }]
  }).lean();
}

function resolveCourse({ message, semesterNo, courses, profile }) {
  const mentioned = findMentionedCourse(message, courses);
  if (mentioned) return { course: mentioned };

  let candidates = courses;
  if (semesterNo != null) candidates = candidates.filter(c => Number(c.semester) === Number(semesterNo));
  if (profile) {
    const enrolled = candidates.filter(c => studentBelongsToCourse(profile, c));
    if (enrolled.length) candidates = enrolled;
  }
  if (candidates.length === 1) return { course: candidates[0] };
  return { ambiguous: candidates.length ? candidates : courses };
}

async function saveEntry({ facultyId, course, profile, fields }) {
  let doc = await Marks.findOne({ courseId: course._id, studentId: profile.user, facultyId });
  if (!doc) {
    doc = new Marks({
      courseId: course._id,
      studentId: profile.user,
      facultyId,
      semester: course.semester || 1,
      academicYear: String(new Date().getFullYear())
    });
  }
  Object.assign(doc, fields);
  doc.isActive = true;
  doc.calculateTotalAndGrade();
  await doc.save();

  createNotification({
    recipientId: profile.user,
    senderId: facultyId,
    type: 'MARKS_UPDATED',
    title: `Marks Published: ${course.name || 'Course'}`,
    message: `Your marks for ${course.name || 'Course'} have been recorded/updated. Total: ${doc.total}/100 (Grade: ${doc.grade}). Check the Exams section of your portal.`,
    courseId: course._id,
    metadata: {
      courseName: course.name,
      semesterExam: doc.semesterExam,
      assignment: doc.assignment,
      practical: doc.practical,
      total: doc.total,
      grade: doc.grade
    }
  }).catch(err => console.error('[Notification Trigger Error]', err));

  return doc;
}

function validateFields(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_MARKS[key]) {
      return `${FIELD_LABELS[key]} must be between 0 and ${MAX_MARKS[key]} (got ${value})`;
    }
  }
  return null;
}

/**
 * Detects a marks-entry command in a Faculty AI chat message
 * (e.g. "Roll 21CS045 DBMS semester exam 48 assignment 18 practical 17")
 * and saves the marks directly. Returns { handled: false } for normal questions.
 */
async function handleMarksEntryCommand(message, facultyUserId) {
  const parsed = parseMarksCommand(message);
  if (!parsed) return { handled: false };

  const facultyId = mongoose.Types.ObjectId.isValid(facultyUserId)
    ? new mongoose.Types.ObjectId(String(facultyUserId))
    : facultyUserId;

  const courses = await Course.find({ faculty: facultyId, isActive: { $ne: false } }).sort({ name: 1 }).lean();
  if (!courses.length) {
    return { handled: true, reply: 'You do not have any subjects assigned yet, so I cannot save marks. Ask the admin to assign a course to you first.' };
  }

  const saved = [];
  const failed = [];

  for (const entry of parsed.entries) {
    const profile = await findStudentByRoll(entry.rollNo);
    if (!profile || !profile.user) {
      failed.push(`Roll **${entry.rollNo}**: no student found with this roll number`);
      continue;
    }

    const { course, ambiguous } = resolveCourse({ message, semesterNo: parsed.semesterNo, courses, profile });
    if (!course) {
      const options = ambiguous.map(c => `**${courseLabel(c)}**`).join(', ');
      failed.push(`Roll **${entry.rollNo}**: please mention the subject — you teach ${options}`);
      continue;
    }

    if (!studentBelongsToCourse(profile, course)) {
      failed.push(`Roll **${entry.rollNo}** (${studentName(profile)}) is not enrolled in **${courseLabel(course)}**`);
      continue;
    }

    const invalid = validateFields(entry.fields);
    if (invalid) {
      failed.push(`Roll **${entry.rollNo}**: ${invalid}`);
      continue;
    }

    try {
      const doc = await saveEntry({ facultyId, course, profile, fields: entry.fields });
      saved.push({ rollNo: entry.rollNo, name: studentName(profile), course, doc, updated: Object.keys(entry.fields) });
    } catch (err) {
      console.error('[FacultyAI MarksEntry] save error:', err);
      failed.push(`Roll **${entry.rollNo}**: could not save (${err.message})`);
    }
  }

  const lines = [];
  if (saved.length) {
    lines.push(`✅ **Marks saved for ${saved.length} student${saved.length > 1 ? 's' : ''}**`);
    for (const s of saved) {
      const changed = s.updated.map(k => FIELD_LABELS[k]).join(', ');
      lines.push(
        `- **${s.name}** (Roll ${s.rollNo}) — ${courseLabel(s.course)}: ` +
        `Semester Exam **${s.doc.semesterExam}/60**, Assignment **${s.doc.assignment}/20**, Practical **${s.doc.practical}/20** → ` +
        `Total **${s.doc.total}/100**, Grade **${s.doc.grade}** (updated: ${changed})`
      );
    }
    lines.push('The marks are now visible in your Marks section and in the student\'s Exams section, and the student has been notified.');
  }
  if (failed.length) {
    if (lines.length) lines.push('');
    lines.push(`⚠️ **Not saved (${failed.length})**`);
    failed.forEach(f => lines.push(`- ${f}`));
    lines.push('Format example: **Roll 21CS045 DBMS semester exam 48 assignment 18 practical 17**');
  }

  return { handled: true, reply: lines.join('\n'), saved: saved.length, failed: failed.length };
}

module.exports = { handleMarksEntryCommand, parseMarksCommand };

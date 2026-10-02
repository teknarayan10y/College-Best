const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Assignment = require('../models/Assignment');
const StudentSubmission = require('../models/StudentSubmission');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const { searchKnowledgeBase } = require('../services/ragService');
const { extractTextFromFile } = require('../services/fileParser');
const pythonMlClient = require('../services/ai/pythonMlClient');

/**
 * Universal Schema-Agnostic Field Normalizer
 */
function normalizeField(obj, candidateKeys = [], defaultValue = '') {
  if (!obj || typeof obj !== 'object') return defaultValue;
  for (const k of candidateKeys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
      return obj[k];
    }
  }
  return defaultValue;
}

/**
 * Universal Name Resolver
 */
function resolveName(obj, fallback = 'Unknown') {
  if (!obj) return fallback;
  if (typeof obj === 'string') return obj.trim() || fallback;
  const direct = normalizeField(obj, ['name', 'fullName', 'student_name', 'faculty_name', 'title', 'username', 'userName']);
  if (direct) return direct;
  const first = normalizeField(obj, ['firstName', 'first_name', 'fname']);
  const last = normalizeField(obj, ['lastName', 'last_name', 'lname']);
  const combined = `${first} ${last}`.trim();
  return combined || fallback;
}

/**
 * Universal ID Resolver
 */
function resolveIdentifier(obj, fallback = 'N/A') {
  return normalizeField(obj, [
    'rollNo', 'rollNumber', 'roll_no', 'regNo', 'registerNumber', 'reg_no', 'regNumber',
    'usn', 'studentId', 'student_id', 'facultyId', 'faculty_id', 'staffId', 'employeeId', 'code', 'id', '_id'
  ], fallback);
}

/**
 * Helper to ensure URLs are properly formatted
 */
function formatUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'Not specified') return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Helper to format upload image URLs into absolute backend URLs
 */
function formatUploadUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed || trimmed === 'Not specified') return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const rel = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}${rel}`;
}

/**
 * Calculates 2-decimal precision percentage
 */
function calcPct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * Helper to fetch aggregated real-time MongoDB context with Universal Dynamic Schema Discovery
 */
async function getStudentContext(userId) {
  const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

  // 1. Fetch User and Student Profile
  const [user, profile] = await Promise.all([
    User.findById(userObjId).select('name email role firstName lastName department phone').lean().catch(() => null),
    StudentProfile.findOne({ $or: [{ user: userObjId }, { user: String(userId) }] }).lean().catch(() => null)
  ]);

  const studentBranch = (normalizeField(profile, ['branch', 'department', 'dept', 'program']) || normalizeField(user, ['department', 'dept'], '')).trim();
  const studentSemester = Number(normalizeField(profile, ['semester', 'sem'])) || null;

  // 2. Build course filter scoped to student's department/semester
  const courseQuery = { isActive: { $ne: false } };
  if (studentBranch) {
    courseQuery.$or = [
      { department: new RegExp(studentBranch, 'i') },
      { department: studentBranch },
      { department: '' },
      { department: { $exists: false } }
    ];
  }
  if (studentSemester) {
    courseQuery.semester = studentSemester;
  }

  // 3. Fetch courses, attendance, marks, submissions, and departments in parallel
  let [enrolledCourses, attendanceDocs, marks, submissions, departmentDocs] = await Promise.all([
    Course.find(courseQuery)
      .populate({ path: 'faculty', select: 'name email firstName lastName' })
      .select('code name credits semester department faculty')
      .lean().catch(() => []),
    Attendance.find({ $or: [{ userId: userObjId }, { userId: String(userId) }] })
      .sort({ date: -1 })
      .lean().catch(() => []),
    Marks.find({ $or: [{ studentId: userObjId }, { studentId: String(userId) }] })
      .populate('courseId', 'code name credits semester department')
      .lean().catch(() => []),
    StudentSubmission.find({ $or: [{ student: userObjId }, { student: String(userId) }] })
      .select('assignment submittedAt note files')
      .lean().catch(() => []),
    mongoose.models.Department ? mongoose.models.Department.find({ isActive: { $ne: false } }).populate('hod', 'name email').lean().catch(() => []) : []
  ]);

  if ((!enrolledCourses || enrolledCourses.length === 0) && studentSemester) {
    enrolledCourses = await Course.find({ semester: studentSemester, isActive: { $ne: false } })
      .populate({ path: 'faculty', select: 'name email firstName lastName' })
      .select('code name credits semester department faculty')
      .lean().catch(() => []);
  }

  const enrolledCourseIds = (enrolledCourses || []).map(c => c._id);

  // 4. Fetch assignments
  let assignmentQuery = {};
  if (enrolledCourseIds.length > 0) {
    assignmentQuery = { courseId: { $in: enrolledCourseIds } };
  } else if (studentSemester) {
    const semCourses = await Course.find({ semester: studentSemester }).select('_id').lean().catch(() => []);
    if (semCourses.length > 0) {
      assignmentQuery = { courseId: { $in: semCourses.map(c => c._id) } };
    }
  }

  const relevantAssignments = await Assignment.find(assignmentQuery)
    .populate('courseId', 'code name')
    .populate('faculty', 'name firstName lastName email')
    .sort({ dueDate: 1 })
    .lean().catch(() => []);

  const submittedAssignmentIds = new Set(
    (submissions || []).map(s => String(s.assignment))
  );

  const pendingAssignments = [];
  const completedAssignments = [];

  (relevantAssignments || []).forEach(assign => {
    const isSubmitted = submittedAssignmentIds.has(String(assign._id));
    let facultyName = '-';
    if (assign.faculty) {
      facultyName = resolveName(assign.faculty, '-');
    }
    const item = {
      id: String(assign._id),
      title: assign.title,
      courseCode: normalizeField(assign.courseId, ['code', 'courseCode'], 'N/A'),
      courseName: resolveName(assign.courseId, 'N/A'),
      faculty: facultyName,
      dueDate: assign.dueDate ? new Date(assign.dueDate).toISOString().split('T')[0] : 'No deadline',
      description: assign.description || ''
    };

    if (isSubmitted) {
      completedAssignments.push(item);
    } else {
      pendingAssignments.push(item);
    }
  });

  // 5. Aggregate attendance across ALL days/records
  let totalClasses = 0;
  let presentClasses = 0;
  let absentClasses = 0;
  let onDutyClasses = 0;
  const subjectMap = new Map();
  const recentLogs = [];

  const dailyRecords = (attendanceDocs || []).map(doc => {
    const rawDate = doc.date ? new Date(doc.date) : null;
    const dateStr = rawDate ? rawDate.toISOString().split('T')[0] : '';
    const formattedDate = rawDate
      ? rawDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    const schedule = (doc.dailySchedule || []).map(s => {
      const statusNorm = String(s.status || '').toUpperCase();
      return {
        session: s.session || 'FN',
        subject: s.subject || 'General',
        status: statusNorm === 'P' ? 'PRESENT' : (statusNorm === 'A' ? 'ABSENT' : (statusNorm === 'OD' ? 'ON-DUTY' : statusNorm || 'PRESENT')),
        faculty: s.faculty || '',
        topic: s.topic || '',
        date: s.date ? new Date(s.date).toISOString().split('T')[0] : dateStr
      };
    });

    const docTotal = typeof doc.totalClasses === 'number' && doc.totalClasses > 0 ? doc.totalClasses : schedule.length;
    const docPresent = typeof doc.presentClasses === 'number' ? doc.presentClasses : schedule.filter(s => s.status === 'PRESENT').length;
    const docAbsent = typeof doc.absentClasses === 'number' ? doc.absentClasses : schedule.filter(s => s.status === 'ABSENT').length;
    const docOnDuty = typeof doc.onDutyClasses === 'number' ? doc.onDutyClasses : schedule.filter(s => s.status === 'ON-DUTY').length;

    totalClasses += docTotal;
    presentClasses += docPresent;
    absentClasses += docAbsent;
    onDutyClasses += docOnDuty;

    for (const item of schedule) {
      const subj = (item.subject || 'General').trim();
      const curr = subjectMap.get(subj) || { subject: subj, present: 0, onDuty: 0, absent: 0, total: 0 };
      curr.total += 1;
      if (item.status === 'PRESENT') curr.present += 1;
      else if (item.status === 'ON-DUTY') curr.onDuty += 1;
      else if (item.status === 'ABSENT') curr.absent += 1;
      subjectMap.set(subj, curr);

      if (recentLogs.length < 10) {
        recentLogs.push({
          subject: subj,
          status: item.status,
          session: item.session,
          date: item.date ? new Date(item.date).toISOString().split('T')[0] : dateStr,
          faculty: item.faculty || '',
          topic: item.topic || ''
        });
      }
    }

    return {
      date: dateStr,
      formattedDate,
      academicYear: doc.academicYear || '2025-26',
      semester: doc.semester || 'Odd',
      totalClasses: docTotal,
      presentClasses: docPresent,
      absentClasses: docAbsent,
      onDutyClasses: docOnDuty,
      schedule
    };
  });

  const effectivePresent = presentClasses + onDutyClasses;
  const percentage = calcPct(effectivePresent, totalClasses);
  const presentPct = calcPct(presentClasses, totalClasses);
  const onDutyPct = calcPct(onDutyClasses, totalClasses);
  const absentPct = calcPct(absentClasses, totalClasses);

  let safeToMiss = 0;
  let neededTo75 = 0;
  if (totalClasses > 0) {
    if (percentage >= 75) {
      safeToMiss = Math.max(0, Math.floor((effectivePresent - 0.75 * totalClasses) / 0.75));
    } else {
      neededTo75 = Math.max(0, Math.ceil((0.75 * totalClasses - effectivePresent) / 0.25));
    }
  }

  const subjectWiseStats = Array.from(subjectMap.values()).map(s => {
    const eff = s.present + s.onDuty;
    const pct = calcPct(eff, s.total);
    return {
      subject: s.subject,
      total: s.total,
      present: s.present,
      onDuty: s.onDuty,
      absent: s.absent,
      percentage: pct,
      status: pct >= 75 ? 'Safe' : 'Shortage'
    };
  });

  const attendanceSummary = {
    totalClasses,
    presentClasses,
    absentClasses,
    onDutyClasses,
    effectivePresent,
    percentage,
    presentPercentage: presentPct,
    onDutyPercentage: onDutyPct,
    absentPercentage: absentPct,
    status: totalClasses === 0 ? 'No attendance records yet' : (percentage >= 75 ? 'Safe (Above 75%)' : 'Warning (Below 75%)'),
    safeToMiss,
    neededTo75,
    subjectWiseStats,
    recentLogs,
    dailyRecords
  };

  // 6. Format Marks and compute GPA dynamically
  const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'F': 0 };
  let totalCredits = 0;
  let weightedPoints = 0;
  let totalScored = 0;
  let maxPossible = 0;

  const marksSummary = (marks || []).map(m => {
    const credits = m.courseId?.credits || 3;
    const gp = GRADE_POINTS[m.grade] !== undefined ? GRADE_POINTS[m.grade] : 0;
    totalCredits += credits;
    weightedPoints += (gp * credits);
    const mTotal = Number(normalizeField(m, ['total', 'marks', 'score'], 0)) || 0;
    totalScored += mTotal;
    maxPossible += 100;

    return {
      courseCode: normalizeField(m.courseId, ['code', 'courseCode'], 'N/A'),
      courseName: resolveName(m.courseId, 'N/A'),
      credits,
      semesterExam: Number(normalizeField(m, ['semesterExam', 'external', 'exam'], 0)) || 0,
      assignmentScore: Number(normalizeField(m, ['assignment', 'internal1'], 0)) || 0,
      practicalScore: Number(normalizeField(m, ['practical', 'lab'], 0)) || 0,
      total: mTotal,
      grade: normalizeField(m, ['grade'], 'F'),
      gradePoints: gp,
      semester: normalizeField(m, ['semester', 'sem']),
      academicYear: normalizeField(m, ['academicYear', 'year'])
    };
  });

  const calculatedGPA = totalCredits > 0
    ? (Math.round((weightedPoints / totalCredits) * 100) / 100).toFixed(2)
    : (marksSummary.length > 0 ? (totalScored / marksSummary.length / 10).toFixed(2) : null);

  const averagePercentage = maxPossible > 0
    ? (Math.round((totalScored / maxPossible) * 10000) / 100)
    : null;

  // 7. Format courses
  const coursesFormatted = (enrolledCourses || []).map(c => ({
    code: normalizeField(c, ['code', 'courseCode'], 'N/A'),
    name: resolveName(c, 'Course'),
    credits: Number(normalizeField(c, ['credits', 'credit'], 3)) || 3,
    semester: normalizeField(c, ['semester', 'sem'], 'Current'),
    department: normalizeField(c, ['department', 'dept', 'branch'], 'General'),
    faculty: resolveName(c.faculty, 'Faculty')
  }));

  const studentName = resolveName(profile) !== 'Unknown' ? resolveName(profile) : resolveName(user, 'Student');

  // Student Profile details
  const studentInfo = {
    isProfileComplete: Boolean(profile),
    name: studentName,
    accountEmail: user?.email || null,
    firstName: normalizeField(profile, ['firstName', 'first_name']) || normalizeField(user, ['firstName'], null),
    lastName: normalizeField(profile, ['lastName', 'last_name']) || normalizeField(user, ['lastName'], null),
    gender: normalizeField(profile, ['gender', 'sex'], null),
    dob: normalizeField(profile, ['dob', 'dateOfBirth'], null),
    bloodGroup: normalizeField(profile, ['bloodGroup', 'blood_group'], null),
    nationality: normalizeField(profile, ['nationality'], null),
    email: normalizeField(profile, ['email']) || normalizeField(user, ['email'], null),
    phone: normalizeField(profile, ['phone', 'mobile', 'contactNo']) || normalizeField(user, ['phone'], null),
    altPhone: normalizeField(profile, ['altPhone', 'alternatePhone'], null),
    address: normalizeField(profile, ['address', 'streetAddress'], null),
    city: normalizeField(profile, ['city'], null),
    state: normalizeField(profile, ['state'], null),
    pincode: normalizeField(profile, ['pincode', 'postalCode', 'zip'], null),
    registerNumber: normalizeField(profile, ['registerNumber', 'regNo', 'reg_no'], null),
    rollNo: normalizeField(profile, ['rollNo', 'rollNumber', 'roll_no', 'usn', 'studentId'], null),
    studentId: resolveIdentifier(profile, null),
    program: normalizeField(profile, ['program', 'degree', 'branch']) || normalizeField(user, ['department'], null),
    branch: normalizeField(profile, ['branch', 'department', 'dept', 'program']) || normalizeField(user, ['department'], null),
    semester: normalizeField(profile, ['semester', 'sem'], coursesFormatted[0]?.semester || null),
    year: normalizeField(profile, ['year', 'academicYear'], null),
    section: normalizeField(profile, ['section', 'sec'], null),
    admissionYear: normalizeField(profile, ['admissionYear'], null),
    passoutYear: normalizeField(profile, ['passoutYear'], null),
    cgpa: normalizeField(profile, ['cgpa', 'gpa', 'overallCgpa'], calculatedGPA),
    calculatedGPA,
    averagePercentage,
    profileImage: formatUploadUrl(profile?.profileImage),
    github: formatUrl(profile?.github),
    linkedin: formatUrl(profile?.linkedin),
    portfolio: formatUrl(profile?.portfolio),
    leetcode: formatUrl(profile?.leetcode),
    hackerrank: formatUrl(profile?.hackerrank),
    codechef: formatUrl(profile?.codechef),
    codeforces: formatUrl(profile?.codeforces),
    kaggle: formatUrl(profile?.kaggle),
    resumeLink: formatUrl(profile?.resumeLink),
    aadhaar: normalizeField(profile, ['aadhaar', 'aadhar'], null),
    hobbies: profile?.hobbies || null,
    achievements: profile?.achievements || null,
    remarks: profile?.remarks || null
  };

  // 8. Dynamic Auto-Discovery of any other database collections
  const dynamicDatabaseEntities = {};
  if (departmentDocs && departmentDocs.length > 0) {
    dynamicDatabaseEntities.departments = departmentDocs.map(d => ({
      code: d.code || '',
      name: d.name || '',
      description: d.description || '',
      hodName: resolveName(d.hod, 'N/A'),
      hodEmail: d.hod?.email || 'N/A'
    }));
  }

  try {
    for (const [modelName, modelRef] of Object.entries(mongoose.models)) {
      if (!['User', 'FacultyProfile', 'StudentProfile', 'Attendance', 'Marks', 'Assignment', 'StudentSubmission', 'Course', 'Department'].includes(modelName)) {
        try {
          const docs = await modelRef.find({}).limit(50).lean();
          if (docs && docs.length > 0) {
            dynamicDatabaseEntities[modelName] = docs;
          }
        } catch { }
      }
    }
  } catch { }

  // 9. Personal Digital Twin Calculation & Actionable Improvements
  let velocityTrajectory = 'STABLE';
  let projected30DayAttendance = attendanceSummary.percentage;
  let riskLevel = 'LOW';
  let riskScore = 15;

  if (attendanceSummary.totalClasses > 0) {
    const recent = (attendanceSummary.dailyRecords || []).slice(0, 5);
    if (recent.length >= 2) {
      const recentTotal = recent.reduce((sum, r) => sum + (r.totalClasses || 0), 0);
      const recentPres = recent.reduce((sum, r) => sum + ((r.presentClasses || 0) + (r.onDutyClasses || 0)), 0);
      const recentPct = calcPct(recentPres, recentTotal);
      if (recentPct > attendanceSummary.percentage + 2) {
        velocityTrajectory = 'UPWARD';
      } else if (recentPct < attendanceSummary.percentage - 2) {
        velocityTrajectory = 'DOWNWARD';
      }
      const projected = Math.round(((attendanceSummary.percentage * 0.4) + (recentPct * 0.6)) * 100) / 100;
      projected30DayAttendance = Math.min(100, Math.max(0, projected));
    }

    if (attendanceSummary.percentage < 65) {
      riskLevel = 'CRITICAL';
      riskScore = 85;
    } else if (attendanceSummary.percentage < 75) {
      riskLevel = 'HIGH';
      riskScore = 65;
    } else if (attendanceSummary.percentage < 80) {
      riskLevel = 'MEDIUM';
      riskScore = 35;
    } else {
      riskLevel = 'LOW';
      riskScore = 10;
    }
  }

  const recommendedImprovements = [];
  if (attendanceSummary.percentage < 75) {
    recommendedImprovements.push(`Attend the next ${attendanceSummary.neededTo75} consecutive class(es) to cross the mandatory 75% attendance threshold.`);
  } else if (attendanceSummary.safeToMiss > 0) {
    recommendedImprovements.push(`Maintain current momentum; you can safely miss up to ${attendanceSummary.safeToMiss} class(es) without falling below 75%.`);
  }
  if (pendingAssignments.length > 0) {
    recommendedImprovements.push(`Submit your pending assignment "${pendingAssignments[0].title}" before ${pendingAssignments[0].dueDate} to secure full internal marks.`);
  }
  if (Number(calculatedGPA || 7) < 8.0) {
    recommendedImprovements.push(`Target at least 45/60 on upcoming semester examinations to elevate your CGPA towards an 8.0+ distinction tier.`);
  }
  if (recommendedImprovements.length === 0) {
    recommendedImprovements.push('Your attendance and grades are in excellent standing. Continue regular class participation.');
  }

  const personalDigitalTwin = {
    attendanceVelocity: velocityTrajectory,
    velocityTrajectory,
    projected30DayAttendance,
    riskLevel,
    riskScore,
    status: riskLevel === 'LOW' ? 'Optimal Performance' : 'Requires Attention',
    academicHealthScore: Math.round((Number(calculatedGPA || 7) * 10 * 0.5) + (attendanceSummary.percentage * 0.5)),
    recommendedImprovements
  };

  return {
    studentInfo,
    attendance: attendanceSummary,
    marks: marksSummary,
    courses: coursesFormatted,
    pendingAssignments,
    completedAssignments,
    personalDigitalTwin,
    dynamicDatabaseEntities
  };
}

/**
 * Helper to match relative or explicit dates within a student's query
 */
function findDailyRecordInQuery(userQuery, dailyRecords = []) {
  const q = (userQuery || '').toLowerCase().trim();
  const now = new Date();

  // 1. Relative keywords: "today"
  if (q.includes('today') || q.includes('todays') || q.includes("today's")) {
    const todayStr = now.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === todayStr);
    return { targetDateLabel: `Today (${todayStr})`, record: match, searchedKey: todayStr };
  }

  // 2. Relative keywords: "yesterday"
  if (q.includes('yesterday') || q.includes('yesterdays') || q.includes("yesterday's")) {
    const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yStr = yDate.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === yStr);
    return { targetDateLabel: `Yesterday (${yStr})`, record: match, searchedKey: yStr };
  }

  // 3. Match standard ISO date: YYYY-MM-DD
  const isoMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const dateStr = isoMatch[1];
    const match = dailyRecords.find(d => d.date === dateStr);
    return { targetDateLabel: dateStr, record: match, searchedKey: dateStr };
  }

  // 4. Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = q.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    const dateStr = `${year}-${month}-${day}`;
    const match = dailyRecords.find(d => d.date === dateStr);
    return { targetDateLabel: `${day}/${month}/${year}`, record: match, searchedKey: dateStr };
  }

  // 5. Match Month names
  const monthNames = [
    { name: 'january', short: 'jan', num: '01' },
    { name: 'february', short: 'feb', num: '02' },
    { name: 'march', short: 'mar', num: '03' },
    { name: 'april', short: 'apr', num: '04' },
    { name: 'may', short: 'may', num: '05' },
    { name: 'june', short: 'jun', num: '06' },
    { name: 'july', short: 'jul', num: '07' },
    { name: 'august', short: 'aug', num: '08' },
    { name: 'september', short: 'sep', num: '09' },
    { name: 'october', short: 'oct', num: '10' },
    { name: 'november', short: 'nov', num: '11' },
    { name: 'december', short: 'dec', num: '12' }
  ];

  for (const m of monthNames) {
    if (q.includes(m.name) || q.includes(m.short)) {
      const dayMatch = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      if (dayMatch) {
        const day = dayMatch[1].padStart(2, '0');
        const year = (q.match(/\b(20\d\d)\b/) || [])[1] || String(now.getFullYear());
        const dateStr = `${year}-${m.num}-${day}`;
        const match = dailyRecords.find(d => d.date === dateStr || (d.date && d.date.endsWith(`-${m.num}-${day}`)));
        return {
          targetDateLabel: `${day} ${m.name.charAt(0).toUpperCase() + m.name.slice(1)} ${year}`,
          record: match,
          searchedKey: dateStr
        };
      }
    }
  }

  return null;
}

/**
 * Concise Fallback Answer Generator (when Gemini LLM is unavailable)
 */
async function generateFallbackAnswer(userQuery, ctx, relevantKnowledge = [], attachedFileText = '', attachedFileName = '', requestedCount = 5) {
  const q = (userQuery || '').toLowerCase().trim();
  const safeCount = Math.max(1, Math.min(25, Number(requestedCount) || 5));
  const isDetailed = /detail|breakdown|elaborate|full report|complete|in-depth|deep|all stats/i.test(q);
  const att = ctx.attendance;
  const info = ctx.studentInfo;
  const marks = ctx.marks || [];
  const courses = ctx.courses || [];
  const pending = ctx.pendingAssignments || [];
  const completed = ctx.completedAssignments || [];

  // 1. Security Check
  if (q.includes('password') || q.includes('salary') || q.includes('other student') || q.includes('admin settings')) {
    return "I can only access and assist with information related to your personal Student Portal and academic records.";
  }

  // 2. Specific Day / Date Queries (Today, Yesterday, Specific Date)
  const dateMatchResult = findDailyRecordInQuery(userQuery, att.dailyRecords || []);
  if (dateMatchResult) {
    const { targetDateLabel, record } = dateMatchResult;
    if (!record) {
      return `No attendance record found for **${targetDateLabel}**.`;
    }

    if (!isDetailed) {
      const statusCounts = [];
      if (record.presentClasses > 0) statusCounts.push(`${record.presentClasses} Present`);
      if (record.onDutyClasses > 0) statusCounts.push(`${record.onDutyClasses} On-Duty`);
      if (record.absentClasses > 0) statusCounts.push(`${record.absentClasses} Absent`);
      return `**${targetDateLabel}:** ${statusCounts.join(', ') || '0 Classes'} out of **${record.totalClasses}** total classes.`;
    }

    const sched = record.schedule || [];
    let sessionList = '';
    if (sched.length > 0) {
      sessionList = '\n\n**Session Breakdown**:\n' + sched.map(s => {
        const icon = s.status === 'PRESENT' ? '✅' : (s.status === 'ON-DUTY' ? '🔷' : '❌');
        return `• ${icon} **${s.subject}** [${s.session}]: **${s.status}**${s.faculty ? ` (${s.faculty})` : ''}`;
      }).join('\n');
    }

    return `📅 **Attendance for ${targetDateLabel}**:\n\n• **Total Classes**: ${record.totalClasses} (Present: ${record.presentClasses}, Absent: ${record.absentClasses}, On-Duty: ${record.onDutyClasses})${sessionList}`;
  }

  // 2b. Personal Digital Twin, Forecast & How to Improve
  if (
    q.includes('forecast') ||
    q.includes('velocity') ||
    q.includes('trajectory') ||
    q.includes('projection') ||
    q.includes('projected') ||
    q.includes('digital twin') ||
    q.includes('twin') ||
    q.includes('future attendance') ||
    q.includes('30-day') ||
    q.includes('30 day') ||
    q.includes('improve') ||
    q.includes('how to improve') ||
    q.includes('boost') ||
    q.includes('what should i do')
  ) {
    const twin = ctx.personalDigitalTwin || {};
    const attPct = att?.percentage || 0;
    const improvements = (twin.recommendedImprovements || []).map((imp, i) => `${i + 1}. ${imp}`).join('\n');
    return `🔮 **Personal Digital Twin Telemetry & Predictive Forecast**:\n\n` +
      `• **Attendance Velocity:** **${twin.velocityTrajectory || 'STABLE'}**\n` +
      `• **30-Day Projected Attendance:** **${twin.projected30DayAttendance || attPct}%** (Current: ${attPct}%)\n` +
      `• **Academic Health Score:** **${twin.academicHealthScore || 85}/100**\n` +
      `• **Risk Status:** **${twin.status || 'Optimal Performance'}** (Risk Level: ${twin.riskLevel || 'LOW'})\n\n` +
      `💡 **How to Improve (Actionable Steps)**:\n${improvements}`;
  }

  // 2c. Syllabus Practice Questions & Quiz Generator (Dynamic Count & Offline Engine)
  if (
    q.includes('syllabus') ||
    q.includes('question') ||
    q.includes('quiz') ||
    q.includes('test') ||
    q.includes('practice') ||
    q.includes('exam question') ||
    q.includes('mcq') ||
    attachedFileText
  ) {
    if (
      q.includes('question') ||
      q.includes('quiz') ||
      q.includes('test') ||
      q.includes('practice') ||
      q.includes('mcq') ||
      q.includes('exam') ||
      q.includes('generate') ||
      (attachedFileText && (q.includes('ask') || q.includes('tell') || q.includes('create') || q.includes('help')))
    ) {
      const topicSource = attachedFileName ? `Uploaded Syllabus (\`${attachedFileName}\`)` : (courses[0]?.name || 'Core Curriculum');
      try {
        const quizRes = await pythonMlClient.generateQuiz(attachedFileText, safeCount, topicSource);
        if (quizRes && quizRes.quizText) {
          return quizRes.quizText;
        }
      } catch (e) {
        // Fall through to deterministic JS fallback
      }
    }
  }

  // 3. Attendance Percentage & Status
  if (
    q.includes('percentage') ||
    q.includes('percent') ||
    q.includes('%') ||
    q === 'attendance' ||
    q === 'what is my attendance' ||
    q === 'what is my attendance percentage' ||
    q === 'show my attendance' ||
    q === 'my attendance'
  ) {
    if (att.totalClasses === 0) {
      return "You currently have **no attendance records** marked.";
    }
    if (!isDetailed) {
      return `Your current attendance is **${att.percentage}%** (${att.status}).`;
    }
    return `### 📊 Attendance Breakdown\n\n` +
      `- **Overall Attendance:** **${att.percentage}%** (${att.status})\n` +
      `- **Classes Attended:** **${att.effectivePresent}** out of **${att.totalClasses}** (Present: ${att.presentClasses}, On-Duty: ${att.onDutyClasses}, Absent: ${att.absentClasses})\n` +
      `- **Safe to Miss:** ${att.safeToMiss} classes | **Needed for 75%:** ${att.neededTo75} classes`;
  }

  if (q.includes('can i miss') || q.includes('safe to miss') || q.includes('bunk') || q.includes('how many class can i miss')) {
    if (att.totalClasses === 0) return "No attendance records available.";
    if (att.percentage >= 75) {
      return `You can safely miss up to **${att.safeToMiss}** class(es) while staying above 75% attendance (Current: **${att.percentage}%**).`;
    }
    return `Your attendance is **${att.percentage}%** (Below 75%). You must attend the next **${att.neededTo75}** consecutive classes to reach 75%.`;
  }

  if (q.includes('need to attend') || q.includes('needed to 75') || q.includes('reach 75') || q.includes('attendance shortage')) {
    if (att.percentage >= 75) {
      return `Your attendance is already **${att.percentage}%** (Safe). You can safely miss up to **${att.safeToMiss}** classes.`;
    }
    return `You need to attend the next **${att.neededTo75}** consecutive class(es) to reach 75% (Current: **${att.percentage}%**).`;
  }

  if (q.includes('subject attendance') || q.includes('subject-wise') || q.includes('subject wise attendance')) {
    if (att.subjectWiseStats.length === 0) {
      return `No subject-wise attendance recorded. Overall: **${att.percentage}%** (${att.effectivePresent}/${att.totalClasses}).`;
    }
    if (!isDetailed) {
      return att.subjectWiseStats.map(s => `**${s.subject}**: **${s.percentage}%** (${s.status})`).join(' | ');
    }
    const breakdown = att.subjectWiseStats
      .map(s => `• **${s.subject}**: **${s.percentage}%** (${s.present + s.onDuty}/${s.total} classes) — *${s.status}*`)
      .join('\n');
    return `📊 **Subject-Wise Attendance**:\n\n${breakdown}\n\n**Overall Attendance**: **${att.percentage}%**`;
  }

  // 4. Marks & Academics Queries
  if (q.includes('marks') || q.includes('grade') || q.includes('score') || q.includes('exam result') || q.includes('gpa') || q.includes('cgpa')) {
    if (q.includes('cgpa') || q.includes('gpa')) {
      return `Your current CGPA is **${info.cgpa || 'N/A'}**.`;
    }
    if (marks.length === 0) return `No semester marks published yet.`;
    if (!isDetailed) {
      return marks.map(m => `**${m.courseName}**: **${m.total}/100** (Grade: **${m.grade}**)`).join(' | ');
    }
    const tableHeader = `| Course | Semester Exam | Assignment | Practical | Total | Grade |\n| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    const tableRows = marks.map(m => `| **${m.courseName}** (${m.courseCode}) | ${m.semesterExam}/60 | ${m.assignmentScore}/20 | ${m.practicalScore}/20 | **${m.total}/100** | **${m.grade}** |`).join('\n');
    return `🎓 **Your Academic Marks & Grades**:\n\n${tableHeader}${tableRows}\n\n🎯 **CGPA**: **${info.cgpa || 'N/A'}**`;
  }

  // 5. Assignments Queries
  if (q.includes('assignment') || q.includes('task') || q.includes('homework') || q.includes('submission')) {
    if (pending.length === 0 && completed.length === 0) return "You have no active assignments posted.";
    if (q.includes('pending') || q.includes('due') || q.includes('left')) {
      if (pending.length === 0) return "🎉 You have **0 pending assignments**!";
      if (!isDetailed) {
        const list = pending.map(p => `**${p.title}** (Due: ${p.dueDate})`).join(', ');
        return `You have **${pending.length}** pending assignment(s): ${list}.`;
      }
      const list = pending.map((p, i) => `${i + 1}. **${p.title}** (${p.courseName}) — *Due: ${p.dueDate}* (Faculty: ${p.faculty})`).join('\n');
      return `📝 **Pending Assignments (${pending.length})**:\n\n${list}`;
    }
    if (!isDetailed) {
      return `You have **${pending.length}** pending assignment(s) and **${completed.length}** completed submission(s).`;
    }
    const pendingList = pending.length > 0 ? pending.map(p => `• ⏳ **${p.title}** (${p.courseName}) - Due: ${p.dueDate}`).join('\n') : '• 🎉 *No pending assignments*';
    const completedList = completed.length > 0 ? completed.map(c => `• ✅ **${c.title}** (${c.courseName}) - *Submitted*`).join('\n') : '• *No submissions yet*';
    return `📚 **Coursework Overview**:\n\n**Pending (${pending.length})**:\n${pendingList}\n\n**Completed (${completed.length})**:\n${completedList}`;
  }

  // 6. Courses Queries
  if (q.includes('course') || q.includes('subject') || q.includes('enrolled')) {
    if (courses.length === 0) return `No courses currently assigned.`;
    if (!isDetailed) {
      const list = courses.map(c => `**${c.name}** (${c.code})`).join(', ');
      return `You are enrolled in **${courses.length}** courses: ${list}.`;
    }
    const list = courses.map((c, i) => `${i + 1}. **${c.name}** (\`${c.code}\`) — Credits: ${c.credits} | Faculty: ${c.faculty}`).join('\n');
    return `📖 **Your Enrolled Courses (Semester ${info.semester || 'Current'})**:\n\n${list}`;
  }

  // 7. Single Profile Field Queries
  const singleFieldMap = [
    { keys: ['cgpa', 'gpa', 'my cgpa'], answer: `Your current CGPA is **${info.cgpa || 'N/A'}**.` },
    { keys: ['roll no', 'roll number', 'rollno', 'roll'], answer: `Your Roll Number is **${info.rollNo || 'N/A'}**.` },
    { keys: ['student id', 'studentid'], answer: `Your Student ID is **${info.studentId || 'N/A'}**.` },
    { keys: ['register no', 'register number', 'reg no'], answer: `Your Register Number is **${info.registerNumber || 'N/A'}**.` },
    { keys: ['email', 'mail', 'email address'], answer: `Your email is **${info.email || 'N/A'}**.` },
    { keys: ['phone', 'mobile', 'contact number'], answer: `Your phone number is **${info.phone || 'N/A'}**.` },
    { keys: ['blood group', 'bloodgroup'], answer: `Your blood group is **${info.bloodGroup || 'N/A'}**.` },
    { keys: ['dob', 'date of birth'], answer: `Your Date of Birth is **${info.dob || 'N/A'}**.` },
    { keys: ['address', 'city', 'state'], answer: `Your address is **${info.address || 'N/A'}**, ${info.city || ''}, ${info.state || ''} ${info.pincode || ''}.` },
    { keys: ['branch', 'department', 'program'], answer: `Your branch is **${info.program || info.branch || 'N/A'}**.` },
    { keys: ['semester', 'sem', 'current sem'], answer: `You are in **Semester ${info.semester || 'N/A'}**.` },
    { keys: ['full name', 'my name', 'name', 'who am i'], answer: `Your name is **${info.name || 'Student'}**.` }
  ];

  for (const item of singleFieldMap) {
    if (item.keys.some(k => q.includes(k))) {
      return item.answer;
    }
  }

  // Full Profile Report
  if (q.includes('profile') || q.includes('full details') || q.includes('all details')) {
    return `👤 **Student Profile: ${info.name}**\n\n` +
      `• **Roll Number**: ${info.rollNo || 'N/A'}\n` +
      `• **Branch**: ${info.program || info.branch || 'N/A'} (Sem ${info.semester || 'N/A'})\n` +
      `• **CGPA**: **${info.cgpa || 'N/A'}**\n` +
      `• **Attendance**: **${att.percentage}%** (${att.status})\n` +
      `• **Email**: ${info.email || 'N/A'}\n` +
      `• **Pending Assignments**: ${pending.length} pending\n`;
  }

  // 8. Institutional Knowledge Match
  const institutionalMatch = (relevantKnowledge || []).find(k => k.similarityScore >= 0.25);
  if (institutionalMatch) {
    return `📜 **${institutionalMatch.title}**\n\n${institutionalMatch.content}`;
  }

  // 9. Default
  return `I am your **Student AI Co-Pilot**. Ask me directly for your attendance, marks, assignments, or courses. (Add *"in detail"* for a full breakdown).`;
}

/**
 * Controller endpoint: POST /api/student/ai/chat
 */
exports.chatWithStudentAi = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'User ID missing in request' });
    }

    const message = req.body?.message || '';
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Message string is required' });
    }

    // Parse attached file if present (any file type: PDF, DOCX, PPTX, images, etc.)
    let attachedFileText = '';
    let attachedFileName = '';
    if (req.file) {
      attachedFileName = req.file.originalname || 'Uploaded File';
      // extractTextFromFile routes all binary formats through the Python ML sidecar automatically
      attachedFileText = await extractTextFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      console.log(`[StudentAI] 📄 Extracted ${attachedFileText ? attachedFileText.trim().length : 0} chars from "${attachedFileName}" (mime: ${req.file.mimetype})`);

      // If standard extraction returned < 30 chars (e.g. very old scanned PDF or encrypted),
      // try direct OCR as a last resort
      if (!attachedFileText || attachedFileText.trim().length < 30) {
        const ext = (req.file.originalname || '').toLowerCase();
        if (ext.endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
          console.log(`[StudentAI] ⚠️  Low text yield. Trying direct OCR for "${attachedFileName}"...`);
          try {
            const ocrText = await pythonMlClient.extractPdfTextOcr(req.file.buffer);
            if (ocrText && ocrText.trim().length > 20) {
              attachedFileText = ocrText;
              console.log(`[StudentAI] ✅ Direct OCR extracted ${attachedFileText.length} chars from "${attachedFileName}"`);
            }
          } catch (ocrErr) {
            console.error('[StudentAI] OCR extraction error:', ocrErr.message);
          }
        }
      }

      if (attachedFileText && attachedFileText.trim().length > 20) {
        console.log(`[StudentAI] ✅ File ready for offline LLM: "${attachedFileName}" (${attachedFileText.trim().length} chars)`);
      } else {
        console.warn(`[StudentAI] ⚠️  File "${attachedFileName}" yielded no usable text — LLM will not have file content.`);
      }
    }

    // Dynamic question count parsing (e.g. "give me 3 questions", "generate 10 questions")
    const countMatch = message.match(/(\d+)\s*(?:questions?|quiz|mcqs?|items?|problems?|practice)/i) || message.match(/(?:give|generate|create|ask|test|provide)\s*(?:me)?\s*(\d+)/i);
    const requestedCount = countMatch ? Math.min(25, Math.max(1, parseInt(countMatch[1] || countMatch[2], 10))) : 5;

    // 1. Concurrently fetch Live Structured Student Context + Institutional Knowledge
    const [studentContext, relevantKnowledge] = await Promise.all([
      getStudentContext(userId),
      searchKnowledgeBase(message, 4, 0.15, { userId: userId, scope: 'student' })
    ]);

    let aiReply = '';
    let modelUsed = 'Deterministic Rule Engine (Hybrid RAG)';

    // Include all relevant knowledge: custom student uploads + institutional policy docs
    const hasKnowledge = (relevantKnowledge || []).length > 0;
    const customUploads = (relevantKnowledge || []).filter(k => k.scope !== 'institution' && k.scope != null && k.similarityScore >= 0.15);
    const policyDocs = (relevantKnowledge || []).filter(k => (k.scope === 'institution' || !k.scope) && k.similarityScore >= 0.25);

    const sources = (relevantKnowledge || [])
      .filter(k => k.similarityScore >= 0.20)
      .map(k => ({
        title: k.title,
        category: k.category,
        score: k.similarityScore,
        sourceFile: k.sourceFile || '',
        scope: k.scope || 'institution'
      }));

    const knowledgeContextText = hasKnowledge
      ? [
        customUploads.length > 0
          ? '[CUSTOM UPLOADED DATA FROM STUDENT]\n' +
          customUploads.map((k, i) => `[Dataset ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
          : null,
        policyDocs.length > 0
          ? '[INSTITUTIONAL REGULATIONS & POLICIES]\n' +
          policyDocs.map((k, i) => `[Policy ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
          : null
      ].filter(Boolean).join('\n\n')
      : 'No matching knowledge documents found.';

    // 2. Invoke Google Gemini LLM
    if (process.env.GEMINI_API_KEY) {
      const candidates = [
        process.env.GEMINI_MODEL,
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.6-flash',
        'gemini-flash-latest'
      ].filter(Boolean);

      const uniqueModels = [...new Set(candidates)];
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      const hybridPrompt = `
You are Student AI, the dedicated intelligent Academic Assistant for the logged-in student.
Your scope of authority is strictly bounded to the personal portal records of the logged-in student and institutional academic regulations.

==================================================
[CRITICAL RULE: NATURAL TONE - ZERO DATABASE META TALK]
==================================================
- NEVER use phrases like "The database contains...", "In the database...", "According to the database...", "The database has...".
- Speak directly, concisely, and naturally to the student.

==================================================
[1. LOGGED-IN STUDENT PORTAL DATABASE CONTEXT (Live MongoDB - Zero Caching)]
${JSON.stringify(studentContext, null, 2)}
==================================================

==================================================
[2. KNOWLEDGE BASE — CUSTOM UPLOADS & STUDENT REGULATIONS (Vector RAG)]
${knowledgeContextText}
==================================================
${attachedFileText ? `
==================================================
[3. ATTACHED FILE: "${attachedFileName}"]
The student has attached a file. Here is the FULL content — answer ANY question about it:

${attachedFileText}
==================================================
` : ''}
[STUDENT QUERY]
"${message}"

[CRITICAL INSTRUCTION: CONCISE BY DEFAULT — DETAILS ONLY WHEN EXPLICITLY ASKED]
1. DEFAULT CONCISE MODE (WHEN USER DID NOT SAY "IN DETAIL"):
   - Unless the student explicitly asks with words like "in detail", "detailed", "breakdown", "full report", or "give complete details":
   - Output ONLY the direct, crisp 1-2 sentence answer containing only the requested number/fact/status.
   - Do NOT output extra unrequested breakdown tables, session lists, subject lists, contact details, or biographical summaries.
   - Examples of DEFAULT CONCISE responses:
     * Question: "What is my attendance percentage?" -> Answer: "Your current attendance is **84.50%** (Safe / Above 75%)."
     * Question: "What is my CGPA?" -> Answer: "Your current CGPA is **8.75**."
     * Question: "What is my roll number?" -> Answer: "Your Roll Number is **21CS101**."
     * Question: "What is my email?" -> Answer: "Your registered email is **student@example.com**."
     * Question: "What is my branch / department?" -> Answer: "Your branch is **Computer Science and Engineering**."
     * Question: "What is my semester?" -> Answer: "You are currently in **Semester 6**."
     * Question: "How many classes can I safely miss?" -> Answer: "You can safely miss up to **2** class(es) while maintaining 75% attendance."
     * Question: "How many assignments are pending?" -> Answer: "You have **2** pending assignment(s)."
     * Question: "What are my marks in DBMS?" -> Answer: "Your DBMS marks are **85/100** (Grade: **A+**)."

2. DETAILED MODE (ONLY WHEN EXPLICITLY ASKED FOR "IN DETAIL" / "DETAILED" / "BREAKDOWN"):
   - When and ONLY when the student explicitly asks with words like "in detail", "detailed breakdown", "full report", "give complete details":
   - Provide the complete structured markdown tables, subject-by-subject attendance stats, date-by-date session logs, and class performance distributions.

3. STRICT CATEGORY SCOPING (NO EXTRA DATA):
   - Asking for attendance -> give ONLY attendance.
   - Asking for marks -> give ONLY marks.
   - Asking for assignments -> give ONLY assignments.
   - Never add conversational fluff, greeting loops, or unnecessary filler.

4. 2-DECIMAL ATTENDANCE PERCENTAGE PRECISION:
   - Always format percentages with exact 2-decimal accuracy (e.g. **66.67%**, **82.35%**, **75.00%**). Never round 66.67% to 67%.

5. GROUNDING IN DATABASE CONTEXT:
   - Base every number, name, and metric directly on the provided live MongoDB context. Never invent or hallucinate data.

6. FORMATTING:
   - Use clean Markdown with bold highlights and concise bullet points.

7. FORECAST, VELOCITY & DIGITAL TWIN:
   - When asked about "forecast", "future attendance", "30-day projection", "velocity", "trajectory", or "digital twin":
   - Refer directly to the personalDigitalTwin object provided in the student portal context.
   - Mention the Velocity Trajectory (e.g. UPWARD, STABLE, or DOWNWARD), Projected 30-Day Attendance percentage, and Risk Level concisely.

8. ACTIONABLE IMPROVEMENT ADVICE (HOW TO IMPROVE):
   - When asked "how to improve", "how to raise my attendance", "how to boost my CGPA", or for academic advice:
   - Provide concrete, numbered, actionable steps from the recommendedImprovements array in personalDigitalTwin.
   - Specify exactly how many classes to attend to reach 75%, which assignment to submit first, and what target marks to aim for in exams.

9. SYLLABUS PRACTICE QUESTIONS & QUIZ GENERATOR (DYNAMIC COUNT: ${requestedCount} QUESTIONS):
   - The student has requested ${requestedCount} question(s).
   - Generate EXACTLY ${requestedCount} high-yield multiple-choice questions based on the attached syllabus text (or their enrolled course topics if no file is attached).
   - Do NOT force 5 questions if the student asked for a different number. Always generate exactly the ${requestedCount} questions requested.
   - For every question, format clearly:
     * Question number (e.g. Q1, Q2... up to Q${requestedCount}) and question text
     * Options: A), B), C), D)
     * Correct Answer Key with a clear, concise concept explanation to help them study and master the topic.

10. OMNISCIENT WHAT-IF & HYPOTHETICAL SIMULATIONS (ALL ACADEMIC DOMAINS):
    - ATTENDANCE WHAT-IF:
      * If missing/bunking N classes: New Total = Total + N, Present stays same -> Projected % = (Present / New Total) * 100.
      * If attending N consecutive classes: New Total = Total + N, New Present = Present + N -> Projected % = (New Present / New Total) * 100.
      * State exact 2-decimal percentage and whether Safe (>=75%) or Shortage (<75%).
    - MARKS & EXAMS WHAT-IF:
      * If asked "What if I score X in semester exam?" or "What if I get Y in internal/assignments?":
      * Evaluation Scheme: Semester Exam (out of 60) + Internal/Assignment (out of 20) + Practical (out of 20) = Total (out of 100).
      * Compute the new Total /100 and determine the projected Letter Grade (O: >=90, A+: 80-89, A: 70-79, B+: 60-69, B: 50-59, RA/Fail: <50).
    - CGPA & GPA WHAT-IF:
      * If asked "What if I get all A's?" or "What if my SGPA is X, what will my CGPA be?":
      * Project the updated CGPA based on course credits and current CGPA.
    - ASSIGNMENTS & DEADLINES WHAT-IF:
      * If asked "What if I don't submit Assignment N?" or "What if I submit after the deadline?":
      * Explain the impact on internal assignment marks (out of 20) and risk of falling below the 50% passing threshold.
`;

      let generated = false;
      for (const modelName of uniqueModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(hybridPrompt);
          if (result && result.response) {
            aiReply = result.response.text();
            modelUsed = `Google Gemini (${modelName}) + Hybrid RAG`;
            generated = true;
            break;
          }
        } catch (err) {
          // Try next candidate
        }
      }

      if (!generated) {
        const offlineRes = await pythonMlClient.queryOfflineLlm(message, studentContext, attachedFileText, attachedFileName, knowledgeContextText, requestedCount);
        if (offlineRes && offlineRes.reply) {
          aiReply = offlineRes.reply;
          modelUsed = offlineRes.model;
        } else {
          aiReply = await generateFallbackAnswer(message, studentContext, relevantKnowledge, attachedFileText, attachedFileName, requestedCount);
        }
      }
    } else {
      const offlineRes = await pythonMlClient.queryOfflineLlm(message, studentContext, attachedFileText, attachedFileName, knowledgeContextText, requestedCount);
      if (offlineRes && offlineRes.reply) {
        aiReply = offlineRes.reply;
        modelUsed = offlineRes.model;
      } else {
        aiReply = await generateFallbackAnswer(message, studentContext, relevantKnowledge, attachedFileText, attachedFileName, requestedCount);
      }
    }

    return res.json({
      success: true,
      reply: aiReply,
      model: modelUsed,
      sources,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[StudentAI Error]:', error);
    return res.status(500).json({
      message: 'Failed to process AI chat request',
      error: error.message
    });
  }
};

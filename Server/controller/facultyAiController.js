const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Assignment = require('../models/Assignment');
const StudentSubmission = require('../models/StudentSubmission');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const User = require('../models/User');
const { searchKnowledgeBase } = require('../services/ragService');
const { extractTextFromFile } = require('../services/fileParser');
const pythonMlClient = require('../services/ai/pythonMlClient');

/**
 * Universal Schema-Agnostic Field Normalizer
 * Extracts values across arbitrary naming conventions (camelCase, snake_case, PascalCase, or custom schemas)
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
async function getFacultyContext(userId, queryMessage = '') {
  const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

  // 1. Fetch Faculty User and Faculty Profile
  const [user, profile] = await Promise.all([
    User.findById(userObjId).select('name email role firstName lastName department').lean().catch(() => null),
    FacultyProfile.findOne({ $or: [{ user: userObjId }, { user: String(userId) }] }).lean().catch(() => null)
  ]);

  const facultyDisplayName = resolveName(user) !== 'Unknown' ? resolveName(user) : (resolveName(profile, 'Faculty'));

  const facultyInfo = {
    userId: String(userId),
    name: facultyDisplayName,
    email: normalizeField(user, ['email']) || normalizeField(profile, ['email'], 'N/A'),
    facultyId: resolveIdentifier(profile, 'N/A'),
    department: normalizeField(profile, ['department', 'dept', 'branch']) || normalizeField(user, ['department', 'dept'], 'N/A'),
    designation: normalizeField(profile, ['designation', 'position', 'role'], 'Faculty'),
    qualification: normalizeField(profile, ['qualification', 'degree', 'highestQualification'], 'N/A'),
    experienceYears: Number(normalizeField(profile, ['experienceYears', 'experience', 'yearsOfExperience'], 0)) || 0,
    experienceSummary: normalizeField(profile, ['experienceSummary', 'summary', 'bio'], 'N/A'),
    employmentStatus: normalizeField(profile, ['employmentStatus', 'status'], 'active'),
    teachingSubjects: profile?.teachingSubjects || [],
    profileImage: profile?.profileImage ? formatUploadUrl(profile.profileImage) : null,
    github: formatUrl(profile?.github),
    linkedin: formatUrl(profile?.linkedin),
    portfolio: formatUrl(profile?.portfolio),
    contact: {
      phone: normalizeField(profile, ['phone', 'mobile', 'phoneNumber', 'contactNo'], 'N/A'),
      altPhone: normalizeField(profile, ['altPhone', 'alternatePhone'], 'N/A'),
      address: normalizeField(profile, ['address', 'streetAddress', 'residentialAddress'], 'N/A'),
      city: normalizeField(profile, ['city'], 'N/A'),
      state: normalizeField(profile, ['state'], 'N/A'),
      pincode: normalizeField(profile, ['pincode', 'postalCode', 'zip'], 'N/A')
    }
  };

  // 2. Fetch all courses taught by this faculty
  const courses = await Course.find({
    $or: [{ faculty: userObjId }, { faculty: String(userId) }],
    isActive: { $ne: false }
  }).sort({ name: 1 }).lean().catch(() => []);

  const facultyCourseIds = courses.map(c => c._id);
  const facultyCourseNames = courses.map(c => (resolveName(c, 'Course')).trim());
  const lcSubjectNames = new Set(facultyCourseNames.map(s => s.toLowerCase()));

  // 3. Resolve all enrolled students across the faculty's courses
  const allStudentProfiles = await StudentProfile.find({}).lean().catch(() => []);
  const studentUserIds = new Set();
  const courseStudentsMap = new Map(); // courseId -> array of students

  for (const c of courses) {
    const sem = c.semester;
    const sec = (c.section || '').toUpperCase();
    const dept = (normalizeField(c, ['department', 'dept', 'branch']) || '').toLowerCase();

    const matched = [];
    for (const p of allStudentProfiles) {
      const pSem = normalizeField(p, ['semester', 'sem']);
      const pSec = normalizeField(p, ['section', 'sec']);
      const pDept = (normalizeField(p, ['branch', 'department', 'dept', 'program']) || '').toLowerCase();

      const okSem = sem == null || String(pSem) === String(sem);
      const okSec = !sec || (pSec || '').toUpperCase() === sec;
      const okDept = !dept || pDept === dept || dept.includes(pDept) || pDept.includes(dept);

      if (okSem && okSec && okDept && p.user) {
        studentUserIds.add(String(p.user));
        matched.push(p);
      }
    }
    courseStudentsMap.set(String(c._id), matched);
  }

  const studentIdsArray = [...studentUserIds].map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);

  // 4. Fetch Student Users, Student Attendance, Student Marks, Assignments, and Submissions in parallel
  const [studentUsers, studentAttendanceDocs, studentMarksDocs, assignments, submissions, facultyOwnAttendanceDocs, departmentDocs] = await Promise.all([
    User.find({ _id: { $in: studentIdsArray } }).select('firstName lastName name email department phone').lean().catch(() => []),
    Attendance.find({ userId: { $in: studentIdsArray } }).sort({ date: -1 }).lean().catch(() => []),
    Marks.find({
      $or: [
        { courseId: { $in: facultyCourseIds } },
        { studentId: { $in: studentIdsArray } }
      ]
    }).populate('courseId', 'name code semester department').lean().catch(() => []),
    Assignment.find({
      $or: [
        { faculty: userObjId },
        { faculty: String(userId) },
        { courseId: { $in: facultyCourseIds } }
      ]
    }).sort({ createdAt: -1 }).lean().catch(() => []),
    StudentSubmission.find({}).populate('assignment').lean().catch(() => []),
    Attendance.find({ $or: [{ userId: userObjId }, { userId: String(userId) }] }).sort({ date: -1 }).lean().catch(() => []),
    mongoose.models.Department ? mongoose.models.Department.find({ isActive: { $ne: false } }).populate('hod', 'name email').lean().catch(() => []) : []
  ]);

  const studentUserMap = new Map((studentUsers || []).map(u => [String(u._id), u]));
  const studentProfileMap = new Map((allStudentProfiles || []).map(p => [String(p.user), p]));

  // Build Unified Schema-Agnostic Student Roster
  const studentRoster = [...studentUserIds].map(idStr => {
    const u = studentUserMap.get(idStr) || {};
    const p = studentProfileMap.get(idStr) || {};
    const fullName = resolveName(p) !== 'Unknown' ? resolveName(p) : resolveName(u, 'Student');
    return {
      studentId: idStr,
      name: fullName,
      rollNo: normalizeField(p, ['rollNo', 'rollNumber', 'roll_no', 'usn'], 'N/A'),
      registerNumber: normalizeField(p, ['registerNumber', 'regNo', 'reg_no', 'regNumber'], 'N/A'),
      email: normalizeField(u, ['email']) || normalizeField(p, ['email'], 'N/A'),
      phone: normalizeField(p, ['phone', 'mobile', 'contactNo']) || normalizeField(u, ['phone'], 'N/A'),
      address: normalizeField(p, ['address', 'city', 'state'], 'N/A'),
      department: normalizeField(p, ['department', 'branch', 'program']) || normalizeField(u, ['department'], 'N/A'),
      semester: normalizeField(p, ['semester', 'sem'], 'N/A'),
      section: normalizeField(p, ['section', 'sec'], 'N/A'),
      cgpa: Number(normalizeField(p, ['cgpa', 'gpa', 'overallCgpa'], 0)) || 0,
      gender: normalizeField(p, ['gender', 'sex'], 'N/A'),
      bloodGroup: normalizeField(p, ['bloodGroup', 'blood_group'], 'N/A'),
      profileImage: p.profileImage ? formatUploadUrl(p.profileImage) : null
    };
  });

  const studentRosterMap = new Map(studentRoster.map(s => [s.studentId, s]));

  // 5. Parse Assignments & Submissions (with Submitted & Pending lists)
  const assignmentMap = new Map();
  const parsedAssignments = (assignments || []).map(a => {
    const aIdStr = String(a._id);
    const relatedCourse = courses.find(c => String(c._id) === String(a.courseId)) || {};
    const courseStudents = courseStudentsMap.get(String(a.courseId)) || [];
    const targetStudentIds = new Set(courseStudents.map(p => String(p.user)));

    const matchingSubs = (submissions || []).filter(s => {
      const subAId = s.assignment?._id ? String(s.assignment._id) : String(s.assignment || '');
      return subAId === aIdStr;
    });

    const submittedStudentIds = new Set();
    const submittedList = matchingSubs.map(s => {
      const sId = String(s.student?._id || s.student || '');
      submittedStudentIds.add(sId);
      const sInfo = studentRosterMap.get(sId) || { name: s.studentName || 'Student', rollNo: 'N/A' };
      return {
        submissionId: String(s._id),
        studentId: sId,
        studentName: sInfo.name,
        rollNo: sInfo.rollNo,
        submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : 'N/A',
        note: s.note || '',
        fileCount: (s.files || []).length,
        files: (s.files || []).map(f => ({ name: f.originalName || 'file', url: formatUploadUrl(f.url || f.path) }))
      };
    });

    const pendingList = [];
    for (const p of courseStudents) {
      const sId = String(p.user);
      if (!submittedStudentIds.has(sId)) {
        const sInfo = studentRosterMap.get(sId);
        if (sInfo) pendingList.push(sInfo);
      }
    }

    const item = {
      assignmentId: aIdStr,
      title: a.title,
      description: a.description || '',
      courseId: String(a.courseId || ''),
      courseName: resolveName(relatedCourse, 'General'),
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().split('T')[0] : 'No deadline',
      totalAssignedStudents: targetStudentIds.size || courseStudents.length,
      submittedCount: submittedList.length,
      pendingCount: pendingList.length,
      submittedStudents: submittedList,
      pendingStudents: pendingList
    };

    assignmentMap.set(aIdStr, item);
    return item;
  });

  // 6. Aggregate Student Attendance (by Subject, by Student, and by Date)
  const studentSubjectAttendance = new Map();
  const studentOverallMap = new Map();
  const dailyAttendanceLog = new Map();

  for (const doc of (studentAttendanceDocs || [])) {
    const sId = String(doc.userId);
    const rawDate = doc.date ? new Date(doc.date) : null;
    const dateStr = rawDate ? rawDate.toISOString().split('T')[0] : '';
    const studentInfo = studentRosterMap.get(sId);

    const dailyLog = dailyAttendanceLog.get(dateStr) || {
      date: dateStr,
      presentStudents: [],
      absentStudents: [],
      onDutyStudents: [],
      totalMarked: 0
    };

    for (const sessionItem of (doc.dailySchedule || [])) {
      const subjName = (sessionItem.subject || '').trim();
      const isFacultySubj = lcSubjectNames.has(subjName.toLowerCase());
      if (!isFacultySubj && lcSubjectNames.size > 0) continue;

      const subjKey = subjName || 'General';
      const subjStat = studentSubjectAttendance.get(subjKey) || {
        subject: subjKey,
        total: 0,
        present: 0,
        onDuty: 0,
        absent: 0,
        students: new Map()
      };

      const statusNorm = String(sessionItem.status || '').toUpperCase();
      subjStat.total += 1;
      if (statusNorm === 'PRESENT' || statusNorm === 'P' || statusNorm === '1') subjStat.present += 1;
      else if (statusNorm === 'ON-DUTY' || statusNorm === 'OD') subjStat.onDuty += 1;
      else if (statusNorm === 'ABSENT' || statusNorm === 'A' || statusNorm === '0') subjStat.absent += 1;

      const studentSubjRecord = subjStat.students.get(sId) || {
        studentId: sId,
        name: studentInfo?.name || 'Unknown',
        rollNo: studentInfo?.rollNo || 'N/A',
        total: 0,
        present: 0,
        onDuty: 0,
        absent: 0
      };
      studentSubjRecord.total += 1;
      if (statusNorm === 'PRESENT' || statusNorm === 'P' || statusNorm === '1') studentSubjRecord.present += 1;
      else if (statusNorm === 'ON-DUTY' || statusNorm === 'OD') studentSubjRecord.onDuty += 1;
      else if (statusNorm === 'ABSENT' || statusNorm === 'A' || statusNorm === '0') studentSubjRecord.absent += 1;
      subjStat.students.set(sId, studentSubjRecord);

      studentSubjectAttendance.set(subjKey, subjStat);

      const stOverall = studentOverallMap.get(sId) || {
        studentId: sId,
        name: studentInfo?.name || 'Unknown',
        rollNo: studentInfo?.rollNo || 'N/A',
        department: studentInfo?.department || 'N/A',
        semester: studentInfo?.semester || 'N/A',
        total: 0,
        present: 0,
        onDuty: 0,
        absent: 0,
        bySubject: new Map()
      };
      stOverall.total += 1;
      if (statusNorm === 'PRESENT' || statusNorm === 'P' || statusNorm === '1') stOverall.present += 1;
      else if (statusNorm === 'ON-DUTY' || statusNorm === 'OD') stOverall.onDuty += 1;
      else if (statusNorm === 'ABSENT' || statusNorm === 'A' || statusNorm === '0') stOverall.absent += 1;

      const stSubj = stOverall.bySubject.get(subjKey) || { total: 0, present: 0, onDuty: 0, absent: 0 };
      stSubj.total += 1;
      if (statusNorm === 'PRESENT' || statusNorm === 'P' || statusNorm === '1') stSubj.present += 1;
      else if (statusNorm === 'ON-DUTY' || statusNorm === 'OD') stSubj.onDuty += 1;
      else if (statusNorm === 'ABSENT' || statusNorm === 'A' || statusNorm === '0') stSubj.absent += 1;
      stOverall.bySubject.set(subjKey, stSubj);
      studentOverallMap.set(sId, stOverall);

      dailyLog.totalMarked += 1;
      const entryDetail = {
        studentId: sId,
        name: studentInfo?.name || 'Unknown',
        rollNo: studentInfo?.rollNo || 'N/A',
        subject: subjKey,
        session: sessionItem.session || 'FN',
        status: sessionItem.status,
        topic: sessionItem.topic || ''
      };

      if (statusNorm === 'PRESENT' || statusNorm === 'P' || statusNorm === '1') dailyLog.presentStudents.push(entryDetail);
      else if (statusNorm === 'ABSENT' || statusNorm === 'A' || statusNorm === '0') dailyLog.absentStudents.push(entryDetail);
      else if (statusNorm === 'ON-DUTY' || statusNorm === 'OD') dailyLog.onDutyStudents.push(entryDetail);
    }

    if (dateStr) dailyAttendanceLog.set(dateStr, dailyLog);
  }

  const subjectAttendanceSummary = Array.from(studentSubjectAttendance.values()).map(s => {
    const effective = s.present + s.onDuty;
    const pct = calcPct(effective, s.total);
    const studentList = Array.from(s.students.values()).map(st => {
      const stEff = st.present + st.onDuty;
      const stPct = calcPct(stEff, st.total);
      return {
        studentId: st.studentId,
        name: st.name,
        rollNo: st.rollNo,
        total: st.total,
        present: st.present,
        onDuty: st.onDuty,
        absent: st.absent,
        percentage: stPct,
        status: stPct >= 75 ? 'Safe' : 'Shortage (<75%)'
      };
    });

    const shortageStudents = studentList.filter(x => x.percentage < 75);

    return {
      subject: s.subject,
      totalClassesMarked: s.total,
      presentClasses: s.present,
      onDutyClasses: s.onDuty,
      absentClasses: s.absent,
      averagePercentage: pct,
      enrolledStudentsCount: studentList.length,
      shortageCount: shortageStudents.length,
      shortageStudents,
      allStudents: studentList
    };
  });

  const studentWiseAttendanceList = Array.from(studentOverallMap.values()).map(st => {
    const effective = st.present + st.onDuty;
    const overallPct = calcPct(effective, st.total);
    const subjects = {};
    for (const [subj, counts] of st.bySubject.entries()) {
      const subEff = counts.present + counts.onDuty;
      subjects[subj] = {
        ...counts,
        percentage: calcPct(subEff, counts.total)
      };
    }
    return {
      studentId: st.studentId,
      name: st.name,
      rollNo: st.rollNo,
      department: st.department,
      semester: st.semester,
      totalClasses: st.total,
      presentClasses: st.present,
      onDutyClasses: st.onDuty,
      absentClasses: st.absent,
      percentage: overallPct,
      status: overallPct >= 75 ? 'Safe' : 'Shortage (<75%)',
      subjects
    };
  });

  // 7. Aggregate Student Marks
  const courseMarksMap = new Map();
  const studentMarksMap = new Map();

  for (const m of (studentMarksDocs || [])) {
    const courseName = resolveName(m.courseId, 'General');
    const sId = String(m.studentId);
    const sInfo = studentRosterMap.get(sId) || { name: 'Unknown', rollNo: 'N/A' };

    const cMarks = courseMarksMap.get(courseName) || [];
    const markVal = Number(normalizeField(m, ['marks', 'mark', 'score', 'obtainedMarks'], 0)) || 0;
    const maxVal = Number(normalizeField(m, ['maxMarks', 'maximumMarks', 'totalMarks'], 100)) || 100;
    cMarks.push({
      studentId: sId,
      name: sInfo.name,
      rollNo: sInfo.rollNo,
      examType: normalizeField(m, ['examType', 'exam', 'testName'], 'Exam'),
      marks: markVal,
      maxMarks: maxVal,
      percentage: calcPct(markVal, maxVal)
    });
    courseMarksMap.set(courseName, cMarks);

    const stMarks = studentMarksMap.get(sId) || [];
    stMarks.push({
      course: courseName,
      examType: normalizeField(m, ['examType', 'exam', 'testName'], 'Exam'),
      marks: markVal,
      maxMarks: maxVal,
      percentage: calcPct(markVal, maxVal)
    });
    studentMarksMap.set(sId, stMarks);
  }

  const courseMarksSummary = Array.from(courseMarksMap.entries()).map(([courseName, marksList]) => {
    let totalMarks = 0, totalMax = 0;
    for (const item of marksList) {
      totalMarks += item.marks;
      totalMax += item.maxMarks;
    }
    const classAvgPct = calcPct(totalMarks, totalMax);
    const sorted = [...marksList].sort((a, b) => b.percentage - a.percentage);
    return {
      course: courseName,
      totalEntries: marksList.length,
      classAveragePercentage: classAvgPct,
      topScorers: sorted.slice(0, 5),
      allMarks: marksList
    };
  });

  // 8. Faculty's Own Personal Attendance
  let facTotal = 0, facPresent = 0, facOnDuty = 0, facAbsent = 0;
  const facultyDailyScheduleList = [];

  for (const doc of (facultyOwnAttendanceDocs || [])) {
    const rawDate = doc.date ? new Date(doc.date) : null;
    const dateStr = rawDate ? rawDate.toISOString().split('T')[0] : '';
    const formattedDate = rawDate ? rawDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';

    const sched = (doc.dailySchedule || []).map(s => ({
      session: s.session || 'FN',
      status: s.status || 'PRESENT',
      subject: s.subject || '',
      topic: s.topic || '',
      date: s.date ? new Date(s.date).toISOString().split('T')[0] : dateStr
    }));

    const docTotal = typeof doc.totalClasses === 'number' && doc.totalClasses > 0 ? doc.totalClasses : sched.length;
    const docPresent = typeof doc.presentClasses === 'number' && doc.totalClasses > 0 ? doc.presentClasses : sched.filter(s => s.status === 'PRESENT').length;
    const docOnDuty = typeof doc.onDutyClasses === 'number' && doc.totalClasses > 0 ? doc.onDutyClasses : sched.filter(s => s.status === 'ON-DUTY').length;
    const docAbsent = typeof doc.absentClasses === 'number' && doc.totalClasses > 0 ? doc.absentClasses : sched.filter(s => s.status === 'ABSENT').length;

    facTotal += docTotal;
    facPresent += docPresent;
    facOnDuty += docOnDuty;
    facAbsent += docAbsent;

    facultyDailyScheduleList.push({
      date: dateStr,
      formattedDate,
      totalClasses: docTotal,
      presentClasses: docPresent,
      onDutyClasses: docOnDuty,
      absentClasses: docAbsent,
      schedule: sched
    });
  }

  const facEffective = facPresent + facOnDuty;
  const facultyPersonalAttendance = {
    totalClasses: facTotal,
    presentClasses: facPresent,
    onDutyClasses: facOnDuty,
    absentClasses: facAbsent,
    overallPercentage: calcPct(facEffective, facTotal),
    presentPercentage: calcPct(facPresent, facTotal),
    onDutyPercentage: calcPct(facOnDuty, facTotal),
    absentPercentage: calcPct(facAbsent, facTotal),
    status: facTotal === 0 ? 'No attendance records' : (calcPct(facEffective, facTotal) >= 75 ? 'Safe (Above 75%)' : 'Shortage (<75%)'),
    dailyLogs: facultyDailyScheduleList
  };

  const dailyAttendanceRecords = Array.from(dailyAttendanceLog.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 9. Dynamic Auto-Discovery of any other database collections (Departments, Notices, Events, etc.)
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
        } catch {}
      }
    }
  } catch {}

  return {
    facultyInfo,
    coursesTaught: courses.map(c => ({
      courseId: String(c._id),
      code: normalizeField(c, ['code', 'courseCode'], 'N/A'),
      name: resolveName(c, 'Course'),
      department: normalizeField(c, ['department', 'dept', 'branch'], 'General'),
      semester: normalizeField(c, ['semester', 'sem'], 'All'),
      section: normalizeField(c, ['section', 'sec'], 'All'),
      credits: Number(normalizeField(c, ['credits', 'credit'], 3)) || 3,
      enrolledStudentsCount: (courseStudentsMap.get(String(c._id)) || []).length
    })),
    totalStudentsUnderFaculty: studentRoster.length,
    studentRoster,
    assignments: parsedAssignments,
    subjectAttendanceSummary,
    studentWiseAttendance: studentWiseAttendanceList,
    dailyAttendanceRecords,
    courseMarksSummary,
    facultyPersonalAttendance,
    nexusMindIntelligence: (() => {
      const atRiskStudents = (studentWiseAttendanceList || []).filter(st => st.percentage < 75 && st.totalClasses > 0);
      let classVelocity = 'STABLE';
      let overallClassAtt = 0;
      if (studentWiseAttendanceList.length > 0) {
        const totalPresent = studentWiseAttendanceList.reduce((acc, s) => acc + (s.presentClasses || 0) + (s.onDutyClasses || 0), 0);
        const totalHeld = studentWiseAttendanceList.reduce((acc, s) => acc + (s.totalClasses || 0), 0);
        overallClassAtt = calcPct(totalPresent, totalHeld);
      }

      if (dailyAttendanceRecords.length >= 3) {
        const recent = dailyAttendanceRecords.slice(0, 5);
        const recentTot = recent.reduce((sum, r) => sum + (r.totalMarked || 0), 0);
        const recentPres = recent.reduce((sum, r) => sum + (r.presentStudents?.length || 0) + (r.onDutyStudents?.length || 0), 0);
        const recentPct = calcPct(recentPres, recentTot);
        if (recentPct > overallClassAtt + 2) classVelocity = 'UPWARD';
        else if (recentPct < overallClassAtt - 2) classVelocity = 'SLIPPING';
      }

      let predictedPassRate = 85;
      if (courseMarksSummary.length > 0) {
        const allMarksEntries = courseMarksSummary.flatMap(c => c.allMarks || []);
        if (allMarksEntries.length > 0) {
          const passing = allMarksEntries.filter(m => m.percentage >= 50).length;
          predictedPassRate = calcPct(passing, allMarksEntries.length);
        }
      }

      const recommendedInterventions = [];
      if (atRiskStudents.length > 0) {
        recommendedInterventions.push(`Issue early shortage notices to ${atRiskStudents.length} student(s) below 75% attendance.`);
      }
      if (classVelocity === 'SLIPPING') {
        recommendedInterventions.push('Class attendance velocity is slipping. Consider holding an interactive doubt session or quiz.');
      }
      if (predictedPassRate < 75) {
        recommendedInterventions.push(`Projected pass rate is ${predictedPassRate}%. Schedule remedial revision sessions before exams.`);
      }
      if (recommendedInterventions.length === 0) {
        recommendedInterventions.push('Class performance and attendance velocity are tracking within healthy parameters.');
      }

      return {
        twinType: 'Classroom Collective Digital Twin',
        classVelocity,
        overallClassAttendance: overallClassAtt,
        predictedPassRate,
        atRiskStudentsCount: atRiskStudents.length,
        atRiskStudents: atRiskStudents.map(s => ({
          name: s.name,
          rollNo: s.rollNo,
          department: s.department,
          semester: s.semester,
          attendancePercentage: s.percentage,
          neededTo75: s.percentage < 75 ? Math.max(0, Math.ceil((0.75 * s.totalClasses - (s.presentClasses + s.onDutyClasses)) / 0.25)) : 0
        })),
        recommendedInterventions,
        subjectVelocities: subjectAttendanceSummary.map(s => ({
          subject: s.subject,
          attendancePct: calcPct(s.present + s.onDuty, s.total),
          shortageCount: (s.students ? Array.from(s.students.values()) : []).filter(st => calcPct(st.present + st.onDuty, st.total) < 75).length
        }))
      };
    })(),
    dynamicDatabaseEntities
  };
}

/**
 * Match a specific student by name or register/roll number in user query
 */
function findStudentInQuery(query, studentRoster = []) {
  const q = (query || '').toLowerCase().trim();
  for (const st of studentRoster) {
    const nameLower = (st.name || '').toLowerCase();
    const rollLower = (st.rollNo || '').toLowerCase();
    const regLower = (st.registerNumber || '').toLowerCase();

    // Check roll number or register number match
    if (rollLower && rollLower !== 'n/a' && q.includes(rollLower)) return st;
    if (regLower && regLower !== 'n/a' && q.includes(regLower)) return st;

    // Check full name or individual first/last name
    if (nameLower && nameLower !== 'unknown student' && (q.includes(nameLower) || (nameLower.length > 3 && nameLower.split(' ').some(part => part.length >= 3 && q.includes(part))))) {
      return st;
    }
  }
  return null;
}

/**
 * Match relative or explicit dates (today, yesterday, 2026-09-01, 1st September)
 */
function findDateInQuery(query, dailyRecords = []) {
  const q = (query || '').toLowerCase().trim();
  const now = new Date();

  // 1. "today"
  if (q.includes('today')) {
    const todayStr = now.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === todayStr);
    return {
      dateLabel: 'Today (' + now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ')',
      dateStr: todayStr,
      record: match
    };
  }

  // 2. "yesterday"
  if (q.includes('yesterday')) {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = yest.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === yestStr);
    return {
      dateLabel: 'Yesterday (' + yest.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ')',
      dateStr: yestStr,
      record: match
    };
  }

  // 3. Explicit YYYY-MM-DD
  const isoMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const dateStr = isoMatch[1];
    const match = dailyRecords.find(d => d.date === dateStr);
    return {
      dateLabel: dateStr,
      dateStr,
      record: match
    };
  }

  // 4. Month name match (e.g. "1st September", "Sep 4")
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
        const match = dailyRecords.find(d => d.date === dateStr);
        return {
          dateLabel: `${day} ${m.name.charAt(0).toUpperCase() + m.name.slice(1)} ${year}`,
          dateStr,
          record: match
        };
      }
    }
  }

  return null;
}

/**
 * Deterministic Rule Engine Fallback Generator for Faculty AI
 */
function generateFallbackAnswer(userQuery, ctx, relevantKnowledge = []) {
  const q = (userQuery || '').toLowerCase().trim();
  const isDetailed = /detail|breakdown|elaborate|full report|complete|in-depth|deep|all stats/i.test(q);
  const roster = ctx.studentRoster || [];
  const assignments = ctx.assignments || [];
  const studentAtt = ctx.studentWiseAttendance || [];
  const marksSummary = ctx.courseMarksSummary || [];
  const facAtt = ctx.facultyPersonalAttendance || {};
  const facInfo = ctx.facultyInfo || {};
  const courses = ctx.coursesTaught || [];
  const dailyRecords = ctx.dailyAttendanceRecords || [];

  // 1. Security Check
  if (q.includes('password') || q.includes('admin password') || q.includes('database uri')) {
    return "I cannot disclose sensitive security credentials or administrator system secrets.";
  }

  // 2. Single-Student Specific Lookups
  const targetStudent = findStudentInQuery(userQuery, roster);
  if (targetStudent) {
    const sId = targetStudent.studentId;
    const stAttRecord = studentAtt.find(s => s.studentId === sId);
    const stMarksList = marksSummary.flatMap(c => (c.allMarks || []).filter(m => m.studentId === sId));

    // A. Student attendance query
    if (q.includes('attendance') || q.includes('absent') || q.includes('present') || q.includes('percentage') || q.includes('classes')) {
      if (stAttRecord) {
        if (!isDetailed) {
          return `**${targetStudent.name}** (${targetStudent.rollNo}) has **${stAttRecord.percentage}%** attendance (${stAttRecord.status}).`;
        }
        let resp = `### 📊 Detailed Attendance: **${targetStudent.name}** (${targetStudent.rollNo})\n\n` +
          `- **Overall Attendance:** **${stAttRecord.percentage}%** (${stAttRecord.status})\n` +
          `- **Total Classes:** ${stAttRecord.totalClasses} | **Present:** ${stAttRecord.presentClasses} | **On-Duty:** ${stAttRecord.onDutyClasses} | **Absent:** ${stAttRecord.absentClasses}\n\n`;

        const subjEntries = Object.entries(stAttRecord.subjects || {});
        if (subjEntries.length > 0) {
          resp += `**Subject Breakdown:**\n`;
          for (const [subj, data] of subjEntries) {
            resp += `- **${subj}:** ${data.percentage}% (Attended ${data.present + data.onDuty}/${data.total})\n`;
          }
        }
        return resp;
      }
      return `No attendance records found for **${targetStudent.name}**.`;
    }

    // B. Student assignment submission query
    if (q.includes('assignment') || q.includes('submit') || q.includes('submission') || q.includes('task') || q.includes('homework')) {
      if (assignments.length === 0) return `No assignments are currently active in your courses.`;

      const results = [];
      for (const a of assignments) {
        const sub = (a.submittedStudents || []).find(s => s.studentId === sId);
        if (sub) {
          results.push(`✅ **${a.title}**: **Submitted**${isDetailed ? ` on ${new Date(sub.submittedAt).toLocaleDateString()}` : ''}`);
        } else {
          results.push(`⏳ **${a.title}**: **Pending / Not Submitted** (Due: ${a.dueDate})`);
        }
      }
      return results.join('\n');
    }

    // C. Student marks query
    if (q.includes('mark') || q.includes('grade') || q.includes('score') || q.includes('exam') || q.includes('cia')) {
      if (stMarksList.length > 0) {
        if (!isDetailed) {
          return stMarksList.map(m => `**${m.examType}:** **${m.marks}/${m.maxMarks}** (${m.percentage}%)`).join(' | ');
        }
        let resp = `### 🎓 Marks for **${targetStudent.name}** (${targetStudent.rollNo})\n\n`;
        for (const m of stMarksList) {
          resp += `- **${m.course} - ${m.examType}:** **${m.marks} / ${m.maxMarks}** (${m.percentage}%)\n`;
        }
        return resp;
      }
      return `No marks recorded yet for **${targetStudent.name}**.`;
    }

    // D. Single student overview
    if (!isDetailed) {
      return `**${targetStudent.name}** (${targetStudent.rollNo}) — Department: ${targetStudent.department} (Sem ${targetStudent.semester}) | Attendance: **${stAttRecord ? stAttRecord.percentage + '%' : 'N/A'}**`;
    }
    return `### 👤 **${targetStudent.name}** (${targetStudent.rollNo})\n\n` +
      `- **Register Number:** ${targetStudent.registerNumber}\n` +
      `- **Department:** ${targetStudent.department} (Sem ${targetStudent.semester} / Sec ${targetStudent.section})\n` +
      `- **Email:** ${targetStudent.email}\n` +
      `- **Overall Attendance:** ${stAttRecord ? stAttRecord.percentage + '%' : 'N/A'}\n`;
  }

  // 3. Date / Relative Day Attendance Queries
  const dateMatch = findDateInQuery(userQuery, dailyRecords);
  if (dateMatch && (q.includes('absent') || q.includes('present') || q.includes('attendance') || q.includes('how many') || q.includes('who'))) {
    const rec = dateMatch.record;
    if (!rec || rec.totalMarked === 0) {
      return `No student attendance records were marked for **${dateMatch.dateLabel}**.`;
    }

    const absentList = rec.absentStudents || [];
    const presentList = rec.presentStudents || [];

    if (q.includes('absent') || q.includes('how many absent')) {
      if (absentList.length === 0) {
        return `**0** students absent on **${dateMatch.dateLabel}**. All students were present.`;
      }
      if (!isDetailed) {
        const names = absentList.map(st => `${st.name} (${st.rollNo})`).join(', ');
        return `**${absentList.length}** student(s) absent on **${dateMatch.dateLabel}**: ${names}.`;
      }
      let resp = `There are **${absentList.length}** student(s) absent on **${dateMatch.dateLabel}**:\n\n`;
      absentList.forEach((st, i) => {
        resp += `${i + 1}. **${st.name}** (${st.rollNo}) — Subject: *${st.subject}* (${st.session})\n`;
      });
      return resp;
    }

    if (q.includes('present') || q.includes('how many present')) {
      if (!isDetailed) {
        return `**${presentList.length}** student(s) present on **${dateMatch.dateLabel}**.`;
      }
      let resp = `There are **${presentList.length}** student(s) present on **${dateMatch.dateLabel}**:\n\n`;
      presentList.slice(0, 15).forEach((st, i) => {
        resp += `${i + 1}. **${st.name}** (${st.rollNo}) — *${st.subject}*\n`;
      });
      if (presentList.length > 15) resp += `\n*...and ${presentList.length - 15} more students.*`;
      return resp;
    }

    if (!isDetailed) {
      return `**${dateMatch.dateLabel}:** Present: **${presentList.length}** | Absent: **${absentList.length}**`;
    }
    return `### 📅 Attendance for **${dateMatch.dateLabel}**\n\n` +
      `- **Present:** **${presentList.length}** | **Absent:** **${absentList.length}** | **On-Duty:** **${rec.onDutyStudents?.length || 0}**\n\n` +
      (absentList.length > 0 ? `**Absentees:** ` + absentList.map(a => `${a.name} (${a.rollNo})`).join(', ') : `No absentees on this day.`);
  }

  // 4. General "How many students absent today"
  if (q.includes('how many') && q.includes('absent')) {
    const todayStr = new Date().toISOString().split('T')[0];
    const rec = dailyRecords.find(d => d.date === todayStr);
    const absents = rec?.absentStudents || [];
    if (absents.length === 0) return `**0** students absent today.`;
    const names = absents.map(st => `${st.name} (${st.rollNo})`).join(', ');
    return `**${absents.length}** student(s) absent today: ${names}.`;
  }

  // 5. Shortage / Below 75% Attendance Queries
  if (q.includes('below 75') || q.includes('shortage') || q.includes('low attendance') || q.includes('at risk')) {
    const shortages = studentAtt.filter(s => s.percentage < 75);
    if (shortages.length === 0) return `All **${studentAtt.length}** students have **75% or higher** attendance.`;
    if (!isDetailed) {
      const list = shortages.map(s => `**${s.name}** (${s.rollNo}): **${s.percentage}%**`).join(', ');
      return `**${shortages.length}** student(s) below 75%: ${list}.`;
    }
    let resp = `### ⚠️ Students Below 75% Attendance (${shortages.length})\n\n`;
    shortages.forEach((s, i) => {
      resp += `${i + 1}. **${s.name}** (${s.rollNo}) — **${s.percentage}%** (${s.presentClasses + s.onDutyClasses}/${s.totalClasses} classes)\n`;
    });
    return resp;
  }

  // 6. Assignment Submissions & Non-Submissions Queries
  if (q.includes('assignment') || q.includes('submission') || q.includes('submitted') || q.includes('pending')) {
    if (assignments.length === 0) return `No active assignments.`;

    if (q.includes('not submitted') || q.includes('pending') || q.includes('haven\'t submitted') || q.includes('who pending')) {
      if (!isDetailed) {
        return assignments.map(a => `**${a.title}**: **${a.pendingCount} pending** out of ${a.totalAssignedStudents}`).join('\n');
      }
      let resp = `### ⏳ Pending Assignment Submissions\n\n`;
      for (const a of assignments) {
        resp += `#### **${a.title}** (${a.courseName}) — Due: ${a.dueDate}\n`;
        resp += `- **Status:** ${a.submittedCount} submitted, **${a.pendingCount} pending**\n`;
        if (a.pendingStudents.length > 0) {
          resp += `- **Pending:** ` + a.pendingStudents.map(s => `${s.name} (${s.rollNo})`).join(', ') + '\n';
        }
      }
      return resp;
    }

    if (!isDetailed) {
      return assignments.map(a => `**${a.title}**: **${a.submittedCount}/${a.totalAssignedStudents} submitted** (${a.pendingCount} pending)`).join('\n');
    }
    let resp = `### 📝 Assignment Submissions Summary\n\n`;
    for (const a of assignments) {
      resp += `- **${a.title}** (${a.courseName}): **${a.submittedCount} / ${a.totalAssignedStudents} Submitted** (${a.pendingCount} Pending) | Due: **${a.dueDate}**\n`;
    }
    return resp;
  }

  // 7. Faculty's Own Personal Attendance & Profile
  if (q.includes('my attendance') || q.includes('personal attendance') || q.includes('my percentage') || (q.includes('my') && q.includes('attendance'))) {
    if (!isDetailed) {
      return `Your faculty attendance is **${facAtt.overallPercentage}%** (${facAtt.presentClasses + facAtt.onDutyClasses}/${facAtt.totalClasses} classes).`;
    }
    return `### 👨‍🏫 Your Faculty Attendance\n\n` +
      `- **Overall Attendance:** **${facAtt.overallPercentage}%** (${facAtt.status})\n` +
      `- **Total Classes:** ${facAtt.totalClasses} | **Present:** ${facAtt.presentClasses} | **On-Duty:** ${facAtt.onDutyClasses} | **Absent:** ${facAtt.absentClasses}`;
  }

  if (q.includes('my profile') || q.includes('my details') || q.includes('faculty id') || q.includes('designation')) {
    if (!isDetailed) {
      return `**${facInfo.name}** | ID: **${facInfo.facultyId}** | Dept: **${facInfo.department}** | Email: **${facInfo.email}**`;
    }
    return `### 👨‍🏫 Faculty Profile: **${facInfo.name}**\n\n` +
      `- **Faculty ID:** ${facInfo.facultyId}\n` +
      `- **Designation:** ${facInfo.designation}\n` +
      `- **Department:** ${facInfo.department}\n` +
      `- **Email:** ${facInfo.email}\n` +
      `- **Qualification:** ${facInfo.qualification}\n` +
      `- **Experience:** ${facInfo.experienceYears} year(s)\n`;
  }

  // 8. Courses Handled
  if (q.includes('course') || q.includes('subject') || q.includes('how many student') || q.includes('class')) {
    if (courses.length === 0) return `You have no active courses assigned.`;
    if (!isDetailed) {
      const list = courses.map(c => `**${c.name}** (${c.enrolledStudentsCount} students)`).join(', ');
      return `You teach **${courses.length}** courses (${ctx.totalStudentsUnderFaculty} total students): ${list}.`;
    }
    let resp = `### 📚 Courses Handled (${courses.length})\n\n`;
    courses.forEach((c, i) => {
      resp += `${i + 1}. **${c.name}** (${c.code}) — Sem ${c.semester} (Sec ${c.section}) | **${c.enrolledStudentsCount} students**\n`;
    });
    return resp;
  }

  // 9. Student Marks & Class Averages
  if (q.includes('mark') || q.includes('grade') || q.includes('cia') || q.includes('average score') || q.includes('top scorer') || q.includes('performance')) {
    if (marksSummary.length === 0) return `No marks uploaded yet for your courses.`;
    if (!isDetailed) {
      return marksSummary.map(c => `**${c.course}**: Class Average is **${c.classAveragePercentage}%** (${c.totalEntries} entries)`).join('\n');
    }
    let resp = `### 🎓 Marks & Class Averages\n\n`;
    for (const c of marksSummary) {
      resp += `#### **${c.course}**\n`;
      resp += `- **Class Average:** **${c.classAveragePercentage}%** across ${c.totalEntries} entries\n`;
      if (c.topScorers.length > 0) {
        resp += `- **Top Scorers:** ` + c.topScorers.slice(0, 3).map(s => `${s.name} (${s.marks}/${s.maxMarks})`).join(', ') + '\n';
      }
    }
    return resp;
  }

  // 9b. NexusMind Classroom Collective Twin, Forecast & Actionable Improvement Advice
  if (
    q.includes('forecast') ||
    q.includes('velocity') ||
    q.includes('trajectory') ||
    q.includes('prediction') ||
    q.includes('predict') ||
    q.includes('pass rate') ||
    q.includes('twin') ||
    q.includes('improve') ||
    q.includes('intervention') ||
    q.includes('recommendation') ||
    q.includes('action')
  ) {
    const twin = ctx.nexusMindIntelligence || {};
    const interventions = (twin.recommendedInterventions || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
    return `🔮 **NexusMind Classroom Intelligence & Predictive Telemetry**:\n\n` +
      `• **Class Velocity Trajectory:** **${twin.classVelocity || 'STABLE'}**\n` +
      `• **Overall Class Attendance:** **${twin.overallClassAttendance || 0}%**\n` +
      `• **Predicted Course Pass Rate:** **${twin.predictedPassRate || 85}%**\n` +
      `• **At-Risk Students Count:** **${twin.atRiskStudentsCount || 0} student(s)**\n\n` +
      `💡 **Actionable Recommendations (How to Improve):**\n${interventions}`;
  }

  // 9c. AI Quiz & Exam Generator from Syllabus
  if (q.includes('quiz') || q.includes('exam question') || q.includes('test paper') || q.includes('mcq') || q.includes('generate questions')) {
    const topic = (ctx.coursesTaught && ctx.coursesTaught[0]?.name) || 'Core Coursework';
    return `📝 **NexusMind AI Assessment Generator**:\n\n` +
      `**Generated Quiz for ${topic} (Bloom's Taxonomy Aligned)**\n\n` +
      `**Q1 (Recall - 1 Mark):**\nWhich of the following describes the primary purpose of indexing in database systems?\n` +
      `A) Data normalization  B) Fast query lookup  C) Storage compression  D) Transaction rollback\n*Answer: B) Fast query lookup*\n\n` +
      `**Q2 (Understand - 2 Marks):**\nExplain the distinction between clustered and non-clustered indexing.\n*Key Point: Clustered determines physical storage order; non-clustered creates a separate index structure with pointers.*\n\n` +
      `**Q3 (Apply - 2 Marks):**\nGiven a table with 100,000 student records, calculate the reduction in block accesses when querying an indexed foreign key.\n\n` +
      `💡 *Tip: Upload your course syllabus or lecture notes via the Knowledge Base panel to generate quizzes customized to your exact lecture slides.*`;
  }

  // 9d. 1-Click Proactive Intervention Notice Dispatcher
  if (q.includes('notice') || q.includes('draft notice') || q.includes('warning letter') || q.includes('advisory')) {
    const atRisk = ctx.nexusMindIntelligence?.atRiskStudents || [];
    if (atRisk.length === 0) return "✅ All enrolled students are currently in good attendance standing (75%+). No warning notices required.";

    const drafts = atRisk.slice(0, 3).map(st =>
      `📨 **Official Academic Advisory Notice**\n` +
      `• **Recipient:** ${st.name} (Roll: ${st.rollNo}, Dept: ${st.department})\n` +
      `• **Current Attendance:** ${st.attendancePercentage}%\n` +
      `• **Notice Text:** "Dear ${st.name}, your course attendance is currently at ${st.attendancePercentage}%, which is below the mandatory 75% examination eligibility threshold. You must attend the next ${st.neededTo75} lecture(s) without absence to qualify for end-semester exams. Please meet your course faculty for academic guidance."\n`
    ).join('\n---\n\n');

    return `🚨 **NexusMind Proactive Intervention Dispatcher (${atRisk.length} Student Notices Prepared)**:\n\n${drafts}`;
  }

  // 9e. What-If Classroom Simulation
  if (q.includes('what if') || q.includes('simulate') || q.includes('simulation') || q.includes('remedial class')) {
    const extraMatch = q.match(/(\d+)\s*(?:extra|remedial|class)/);
    const extraClasses = extraMatch ? Number(extraMatch[1]) : 3;

    const atRisk = ctx.nexusMindIntelligence?.atRiskStudents || [];
    const recovered = atRisk.filter(st => {
      const needed = st.neededTo75 || 0;
      return extraClasses >= needed;
    }).length;

    return `🧪 **NexusMind Classroom What-If Simulation**:\n\n` +
      `• **Simulated Action:** Conducting **${extraClasses}** additional remedial/revision class(es)\n` +
      `• **Baseline Students with Shortage:** **${atRisk.length}**\n` +
      `• **Students Recovered above 75%:** **${recovered} student(s)**\n` +
      `• **Remaining at-Risk Students:** **${Math.max(0, atRisk.length - recovered)} student(s)**\n\n` +
      (recovered > 0
        ? `✅ *Impact: Conducting ${extraClasses} remedial session(s) successfully restores ${recovered} student(s) to safe examination qualification.*`
        : `ℹ️ *Impact: Additional sessions will be required for severe shortage cases (>4 missed lectures).*`);
  }

  // 10. Regulations
  if (relevantKnowledge.length > 0) {
    const k = relevantKnowledge[0];
    if (!isDetailed) return `**${k.title}:** ${k.content.slice(0, 200)}...`;
    return `### 📜 ${k.title}\n\n${k.content}\n\n*(Source: Official Institutional Regulations)*`;
  }

  // 11. Default General Help
  return `I am your **Faculty AI Co-Pilot**. Ask me directly for attendance, student lookups, assignments, or marks. (Add *"in detail"* if you want a comprehensive breakdown).`;
}

/**
 * Controller: POST /api/faculty/ai/chat
 */
exports.chatWithFacultyAi = async (req, res) => {
  try {
    const message = req.body?.message || '';
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    // Parse attached file if present (ChatGPT-style)
    let attachedFileText = '';
    let attachedFileName = '';
    if (req.file) {
      attachedFileName = req.file.originalname || 'Uploaded File';
      attachedFileText = await extractTextFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    // 1. Fetch live Faculty Database Context & Institutional Knowledge
    const [facultyContext, relevantKnowledge] = await Promise.all([
      getFacultyContext(userId),
      searchKnowledgeBase(message, 4, 0.15, { userId: userId, scope: 'faculty' })
    ]);

    let aiReply = '';
    // Include all relevant knowledge: custom faculty uploads + policy docs
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
            ? '[CUSTOM UPLOADED DATA FROM FACULTY]\n' +
              customUploads.map((k, i) => `[Dataset ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
            : null,
          policyDocs.length > 0
            ? '[INSTITUTIONAL REGULATIONS & POLICIES]\n' +
              policyDocs.map((k, i) => `[Policy ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
            : null
        ].filter(Boolean).join('\n\n')
      : 'No matching knowledge documents found.';

    // 2. Invoke Google Gemini LLM if API Key is available
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
You are Faculty AI, the dedicated intelligent Teaching, Attendance, and Course Management Co-Pilot for the logged-in Faculty Member.
Your scope of authority is strictly bounded to the courses, student rosters, assignment submissions, marks, and personal attendance records in the faculty portal.

==================================================
[1. LOGGED-IN FACULTY PORTAL DATABASE CONTEXT (Live MongoDB - Zero Caching)]
${JSON.stringify(facultyContext, null, 2)}
==================================================

==================================================
[2. KNOWLEDGE BASE — CUSTOM UPLOADS & ACADEMIC POLICIES (Vector RAG)]
${knowledgeContextText}
==================================================
${attachedFileText ? `
==================================================
[3. ATTACHED FILE: "${attachedFileName}"]
The user has attached a file. Here is the FULL content — answer ANY question about it:

${attachedFileText}
==================================================
` : ''}
[FACULTY QUERY]
"${message}"

==================================================
[CRITICAL RULES: NATURAL TONE - NO DATABASE/META TALK]
==================================================
- NEVER use phrases like "The database contains...", "In the database...", "According to the database...", "The database has...".
- Speak directly, concisely, and naturally as an intelligent faculty co-pilot.

==================================================
[2. RETRIEVED ACADEMIC REGULATIONS & POLICIES (Vector RAG)]
${knowledgeContextText}
==================================================

[FACULTY QUERY]
"${message}"

[CRITICAL INSTRUCTION: CONCISE BY DEFAULT — DETAILS ONLY WHEN EXPLICITLY ASKED]
1. DEFAULT CONCISE MODE (WHEN USER DID NOT SAY "IN DETAIL"):
   - Unless the user explicitly asks with words like "in detail", "detailed", "breakdown", "full report", or "give complete details":
   - Output ONLY the direct, crisp 1-2 sentence answer containing only the requested number/fact/status.
   - Do NOT output extra unrequested breakdown tables, session lists, subject lists, contact details, or biographical summaries.
   - Examples of DEFAULT CONCISE responses:
     * User: "What is Rahul's attendance?" -> Output: "**Rahul (21CS045)** has **66.67%** attendance (Shortage)."
     * User: "How many students absent today?" -> Output: "There are **2** students absent today: **Rahul** (21CS045) and **Priya** (21CS048)."
     * User: "Did Priya submit Assignment 1?" -> Output: "Yes, **Priya** submitted **Assignment 1** on **2026-09-02**." (or "No, Priya has not submitted Assignment 1 yet.")
     * User: "What is the CIA-1 class average?" -> Output: "The **CIA-1** class average for **DBMS** is **74.50%**."
     * User: "What is my attendance?" -> Output: "Your faculty attendance is **92.50%** (37/40 classes)."
     * User: "Who are the students below 75%?" -> Output: "There are **3** students below 75% attendance: **Rahul** (66.67%), **Aakash** (71.43%), **Sneha** (73.33%)."

2. DETAILED MODE (ONLY WHEN EXPLICITLY ASKED FOR "IN DETAIL" / "DETAILED" / "BREAKDOWN"):
   - When and ONLY when the user explicitly asks with words like "in detail", "detailed breakdown", "full report", "give complete details":
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

7. FORECAST, PREDICTIONS & ACTIONABLE IMPROVEMENT ADVICE:
   - When asked about "forecast", "prediction", "velocity", "trajectory", "at risk", "pass rate", or "how to improve class performance":
   - Refer directly to the nexusMindIntelligence object provided in the database context.
   - State the Class Velocity (UPWARD/STABLE/SLIPPING), Predicted Pass Rate %, and names of at-risk students.
   - Always conclude with concrete, numbered actionable recommendations for the faculty member on how to intervene and improve class outcomes.

8. OMNISCIENT WHAT-IF & CLASSROOM SIMULATIONS (ALL DOMAINS):
   - REMEDIAL SESSIONS & ATTENDANCE: If asked "What if I conduct N remedial classes?", calculate how many at-risk students (<75%) get recovered back above 75%.
   - MARKS & CLASS PASS RATES: If asked "What if the class average in internal exam increases by N marks?" or "What if failing students score 40/60 in semester exam?": calculate the projected class pass rate % and shift in grade distribution.
   - ASSIGNMENT DEADLINES & SUBMISSIONS: If asked "What if I extend the deadline by N days?" or "What if late submissions are accepted?": analyze expected submission recovery from the pending assignments roster.
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
          // Fall through to next model candidate
        }
      }

      if (!generated) {
        const offlineRes = await pythonMlClient.queryFacultyOfflineLlm(message, facultyContext, attachedFileText, attachedFileName, knowledgeContextText);
        if (offlineRes && offlineRes.reply) {
          aiReply = offlineRes.reply;
          modelUsed = offlineRes.model;
        } else {
          aiReply = generateFallbackAnswer(message, facultyContext, relevantKnowledge);
        }
      }
    } else {
      const offlineRes = await pythonMlClient.queryFacultyOfflineLlm(message, facultyContext, attachedFileText, attachedFileName, knowledgeContextText);
      if (offlineRes && offlineRes.reply) {
        aiReply = offlineRes.reply;
        modelUsed = offlineRes.model;
      } else {
        aiReply = generateFallbackAnswer(message, facultyContext, relevantKnowledge);
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
    console.error('[FacultyAI Error]:', error);
    return res.status(500).json({
      message: 'Failed to process Faculty AI chat request',
      error: error.message
    });
  }
};

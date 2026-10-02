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
const Department = require('../models/Department');
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
 * Universal Identifier Resolver
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
 * Institution-Wide MongoDB Real-Time Context Extractor with Universal Schema Discovery
 */
async function getAdminContext(adminUserId) {
  const adminObjId = mongoose.Types.ObjectId.isValid(adminUserId) ? new mongoose.Types.ObjectId(adminUserId) : adminUserId;

  // 1. Concurrently fetch all core collections
  const [
    adminUser,
    allUsers,
    allStudentProfiles,
    allFacultyProfiles,
    allDepartments,
    allCourses,
    allAttendanceDocs,
    allMarksDocs,
    allAssignments,
    allSubmissions
  ] = await Promise.all([
    User.findById(adminObjId).select('name email role').lean().catch(() => null),
    User.find({}).select('name email role firstName lastName department phone isActive').lean().catch(() => []),
    StudentProfile.find({}).lean().catch(() => []),
    FacultyProfile.find({}).lean().catch(() => []),
    Department.find({}).populate('hod', 'name email').lean().catch(() => []),
    Course.find({ isActive: { $ne: false } }).populate('faculty', 'name email firstName lastName').lean().catch(() => []),
    Attendance.find({}).sort({ date: -1 }).lean().catch(() => []),
    Marks.find({}).populate('courseId', 'code name credits semester department').lean().catch(() => []),
    Assignment.find({}).populate('courseId', 'code name').populate('faculty', 'name firstName lastName email').sort({ dueDate: 1 }).lean().catch(() => []),
    StudentSubmission.find({}).populate('student', 'name email').lean().catch(() => [])
  ]);

  // Index profiles by user ID
  const studentProfileMap = new Map();
  (allStudentProfiles || []).forEach(p => {
    if (p.user) studentProfileMap.set(String(p.user), p);
  });

  const facultyProfileMap = new Map();
  (allFacultyProfiles || []).forEach(p => {
    if (p.user) facultyProfileMap.set(String(p.user), p);
  });

  // 2. Build Student Roster with attendance and marks mapping
  const studentUsers = (allUsers || []).filter(u => u.role === 'student');
  const facultyUsers = (allUsers || []).filter(u => u.role === 'faculty');

  // Attendance map per student user ID
  const studentAttendanceMap = new Map();
  let collegeTotalStudentClasses = 0;
  let collegeTotalStudentPresent = 0;
  let collegeTotalStudentOnDuty = 0;
  let collegeTotalStudentAbsent = 0;

  // Daily college-wide logs map
  const dailyCollegeAttendanceMap = new Map();

  for (const doc of (allAttendanceDocs || [])) {
    const rawDate = doc.date ? new Date(doc.date) : null;
    const dateStr = rawDate ? rawDate.toISOString().split('T')[0] : '';
    const userIdStr = String(doc.userId);

    // Identify if user is student or faculty
    const isStudent = studentUsers.some(s => String(s._id) === userIdStr);
    const isFaculty = facultyUsers.some(f => String(f._id) === userIdStr);

    const sched = (doc.dailySchedule || []).map(s => {
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

    const docTotal = typeof doc.totalClasses === 'number' && doc.totalClasses > 0 ? doc.totalClasses : sched.length;
    const docPresent = typeof doc.presentClasses === 'number' ? doc.presentClasses : sched.filter(s => s.status === 'PRESENT').length;
    const docAbsent = typeof doc.absentClasses === 'number' ? doc.absentClasses : sched.filter(s => s.status === 'ABSENT').length;
    const docOnDuty = typeof doc.onDutyClasses === 'number' ? doc.onDutyClasses : sched.filter(s => s.status === 'ON-DUTY').length;

    if (isStudent) {
      collegeTotalStudentClasses += docTotal;
      collegeTotalStudentPresent += docPresent;
      collegeTotalStudentOnDuty += docOnDuty;
      collegeTotalStudentAbsent += docAbsent;

      const stAtt = studentAttendanceMap.get(userIdStr) || {
        total: 0,
        present: 0,
        onDuty: 0,
        absent: 0,
        bySubject: new Map(),
        dailyRecords: []
      };

      stAtt.total += docTotal;
      stAtt.present += docPresent;
      stAtt.onDuty += docOnDuty;
      stAtt.absent += docAbsent;

      for (const item of sched) {
        const subj = (item.subject || 'General').trim();
        const curr = stAtt.bySubject.get(subj) || { subject: subj, present: 0, onDuty: 0, absent: 0, total: 0 };
        curr.total += 1;
        if (item.status === 'PRESENT') curr.present += 1;
        else if (item.status === 'ON-DUTY') curr.onDuty += 1;
        else if (item.status === 'ABSENT') curr.absent += 1;
        stAtt.bySubject.set(subj, curr);
      }

      stAtt.dailyRecords.push({
        date: dateStr,
        totalClasses: docTotal,
        presentClasses: docPresent,
        absentClasses: docAbsent,
        onDutyClasses: docOnDuty,
        schedule: sched
      });

      studentAttendanceMap.set(userIdStr, stAtt);
    }

    // Daily college-wide register
    if (dateStr) {
      const dailyEntry = dailyCollegeAttendanceMap.get(dateStr) || {
        date: dateStr,
        totalMarked: 0,
        presentStudents: [],
        absentStudents: [],
        onDutyStudents: [],
        facultyLogs: []
      };

      dailyEntry.totalMarked += docTotal;
      if (isStudent) {
        const uObj = studentUsers.find(s => String(s._id) === userIdStr);
        const pObj = studentProfileMap.get(userIdStr);
        const sName = resolveName(pObj) !== 'Unknown' ? resolveName(pObj) : resolveName(uObj, 'Student');
        const sRoll = resolveIdentifier(pObj, 'N/A');

        if (docAbsent > 0) {
          dailyEntry.absentStudents.push({ name: sName, rollNo: sRoll, absentClasses: docAbsent, total: docTotal });
        }
        if (docPresent > 0) {
          dailyEntry.presentStudents.push({ name: sName, rollNo: sRoll, presentClasses: docPresent, total: docTotal });
        }
        if (docOnDuty > 0) {
          dailyEntry.onDutyStudents.push({ name: sName, rollNo: sRoll, onDutyClasses: docOnDuty, total: docTotal });
        }
      } else if (isFaculty) {
        const uObj = facultyUsers.find(f => String(f._id) === userIdStr);
        const pObj = facultyProfileMap.get(userIdStr);
        const fName = resolveName(pObj) !== 'Unknown' ? resolveName(pObj) : resolveName(uObj, 'Faculty');
        dailyEntry.facultyLogs.push({
          name: fName,
          status: docPresent > 0 ? 'PRESENT' : (docOnDuty > 0 ? 'ON-DUTY' : 'ABSENT'),
          schedule: sched
        });
      }

      dailyCollegeAttendanceMap.set(dateStr, dailyEntry);
    }
  }

  // 3. Aggregate Marks per student
  const studentMarksMap = new Map();
  const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'F': 0 };

  for (const m of (allMarksDocs || [])) {
    const sId = String(m.studentId);
    const currMarks = studentMarksMap.get(sId) || [];
    const credits = m.courseId?.credits || 3;
    const gp = GRADE_POINTS[m.grade] !== undefined ? GRADE_POINTS[m.grade] : 0;
    const mTotal = Number(normalizeField(m, ['total', 'marks', 'score'], 0)) || 0;

    currMarks.push({
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
    });

    studentMarksMap.set(sId, currMarks);
  }

  // 4. Build Complete Student Roster with calculated metrics
  const fullStudentRoster = studentUsers.map(u => {
    const sId = String(u._id);
    const prof = studentProfileMap.get(sId);
    const att = studentAttendanceMap.get(sId) || { total: 0, present: 0, onDuty: 0, absent: 0, bySubject: new Map(), dailyRecords: [] };
    const marks = studentMarksMap.get(sId) || [];

    const effective = att.present + att.onDuty;
    const attPct = calcPct(effective, att.total);

    // Calculate GPA
    let totalCredits = 0;
    let weightedPoints = 0;
    let totalScored = 0;
    marks.forEach(m => {
      totalCredits += m.credits;
      weightedPoints += (m.gradePoints * m.credits);
      totalScored += m.total;
    });

    const calcGPA = totalCredits > 0
      ? (Math.round((weightedPoints / totalCredits) * 100) / 100).toFixed(2)
      : (marks.length > 0 ? (totalScored / marks.length / 10).toFixed(2) : null);

    const sName = resolveName(prof) !== 'Unknown' ? resolveName(prof) : resolveName(u, 'Student');
    const sRoll = normalizeField(prof, ['rollNo', 'rollNumber', 'roll_no', 'usn']) || normalizeField(prof, ['studentId', 'student_id', 'registerNumber', 'regNo']) || 'N/A';
    const sIdVal = normalizeField(prof, ['studentId', 'student_id']) || normalizeField(prof, ['rollNo', 'rollNumber', 'roll_no', 'usn', 'regNo', 'registerNumber']) || sId;
    const sReg = normalizeField(prof, ['registerNumber', 'regNo', 'reg_no']) || sRoll;
    const branch = normalizeField(prof, ['branch', 'department', 'dept', 'program']) || normalizeField(u, ['department', 'dept'], 'General');
    const semester = normalizeField(prof, ['semester', 'sem'], 'N/A');
    const cgpa = normalizeField(prof, ['cgpa', 'gpa'], calcGPA || 'N/A');

    const subjectAttendance = Array.from(att.bySubject.values()).map(s => {
      const sEff = s.present + s.onDuty;
      const pct = calcPct(sEff, s.total);
      return {
        subject: s.subject,
        total: s.total,
        present: s.present,
        onDuty: s.onDuty,
        absent: s.absent,
        percentage: pct,
        status: pct >= 75 ? 'Safe' : 'Shortage (<75%)'
      };
    });

    return {
      userId: sId,
      studentId: sIdVal,
      rollNo: sRoll,
      registerNumber: sReg,
      name: sName,
      email: u.email || prof?.email || 'N/A',
      phone: normalizeField(prof, ['phone', 'mobile', 'contactNo']) || normalizeField(u, ['phone'], 'N/A'),
      department: branch,
      branch,
      semester,
      section: normalizeField(prof, ['section', 'sec'], 'A'),
      cgpa,
      attendance: {
        totalClasses: att.total,
        presentClasses: att.present,
        onDutyClasses: att.onDuty,
        absentClasses: att.absent,
        effectivePresent: effective,
        percentage: attPct,
        status: att.total === 0 ? 'No records' : (attPct >= 75 ? 'Safe' : 'Shortage (<75%)'),
        subjectWise: subjectAttendance
      },
      marksCount: marks.length,
      marks,
      profileImage: formatUploadUrl(prof?.profileImage),
      github: formatUrl(prof?.github),
      linkedin: formatUrl(prof?.linkedin),
      leetcode: formatUrl(prof?.leetcode)
    };
  });

  // 5. Build Complete Faculty Roster
  const fullFacultyRoster = facultyUsers.map(u => {
    const fId = String(u._id);
    const prof = facultyProfileMap.get(fId);

    const fName = resolveName(prof) !== 'Unknown' ? resolveName(prof) : resolveName(u, 'Faculty');
    const fIdVal = normalizeField(prof, ['facultyId', 'faculty_id', 'staffId', 'employeeId', 'code']) || normalizeField(u, ['facultyId', 'faculty_id', 'staffId', 'employeeId']) || fId;
    const dept = normalizeField(prof, ['department', 'dept', 'branch']) || normalizeField(u, ['department'], 'General');
    const designation = normalizeField(prof, ['designation', 'roleTitle', 'title'], 'Faculty / Assistant Professor');

    // Assigned courses for this faculty
    const assignedCourses = (allCourses || []).filter(c => {
      if (!c.faculty) return false;
      const cFacId = typeof c.faculty === 'object' ? String(c.faculty._id) : String(c.faculty);
      return cFacId === fId;
    }).map(c => ({
      courseId: String(c._id),
      code: normalizeField(c, ['code', 'courseCode'], 'N/A'),
      name: resolveName(c, 'Course'),
      semester: normalizeField(c, ['semester', 'sem'], 'N/A'),
      department: normalizeField(c, ['department', 'dept'], dept),
      credits: normalizeField(c, ['credits'], 3)
    }));

    return {
      userId: fId,
      facultyId: fIdVal,
      staffId: normalizeField(prof, ['staffId', 'employeeId', 'facultyId']) || fIdVal,
      name: fName,
      email: u.email || prof?.email || 'N/A',
      phone: normalizeField(prof, ['phone', 'mobile', 'contactNo']) || normalizeField(u, ['phone'], 'N/A'),
      department: dept,
      designation,
      qualification: normalizeField(prof, ['qualification', 'highestDegree'], 'N/A'),
      specialization: normalizeField(prof, ['specialization', 'researchArea'], 'N/A'),
      experience: normalizeField(prof, ['experience', 'yearsOfExperience'], 'N/A'),
      assignedCoursesCount: assignedCourses.length,
      assignedCourses,
      profileImage: formatUploadUrl(prof?.profileImage)
    };
  });

  // 6. Aggregate College-Wide Assignments & Submissions
  const submittedSet = new Set((allSubmissions || []).map(s => `${String(s.assignment)}_${String(s.student?._id || s.student)}`));

  const collegeAssignments = (allAssignments || []).map(a => {
    const aIdStr = String(a._id);
    const courseName = resolveName(a.courseId, 'General');
    const courseCode = normalizeField(a.courseId, ['code', 'courseCode'], 'N/A');
    const facName = resolveName(a.faculty, 'Faculty');

    const courseDept = normalizeField(a.courseId, ['department', 'dept']);
    const courseSem = Number(normalizeField(a.courseId, ['semester', 'sem']));

    // Target students for this course
    const eligibleStudents = fullStudentRoster.filter(st => {
      if (courseDept && st.department.toLowerCase() !== courseDept.toLowerCase()) return false;
      if (courseSem && Number(st.semester) !== courseSem) return false;
      return true;
    });

    const submittedStudents = [];
    const pendingStudents = [];

    eligibleStudents.forEach(st => {
      const key = `${aIdStr}_${st.userId}`;
      if (submittedSet.has(key)) {
        submittedStudents.push({ name: st.name, rollNo: st.rollNo, studentId: st.studentId, email: st.email });
      } else {
        pendingStudents.push({ name: st.name, rollNo: st.rollNo, studentId: st.studentId, email: st.email });
      }
    });

    return {
      assignmentId: aIdStr,
      title: a.title,
      courseName,
      courseCode,
      faculty: facName,
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().split('T')[0] : 'No deadline',
      totalEligible: eligibleStudents.length || fullStudentRoster.length,
      submittedCount: submittedStudents.length,
      pendingCount: pendingStudents.length,
      submittedStudents,
      pendingStudents
    };
  });

  // 7. Departments Summary
  const departmentsSummary = (allDepartments || []).map(d => {
    const dName = d.name || '';
    const dCode = d.code || '';
    const hodName = resolveName(d.hod, 'Not assigned');

    const depStudents = fullStudentRoster.filter(s => s.department.toLowerCase() === dName.toLowerCase() || s.department.toLowerCase() === dCode.toLowerCase());
    const depFaculty = fullFacultyRoster.filter(f => f.department.toLowerCase() === dName.toLowerCase() || f.department.toLowerCase() === dCode.toLowerCase());
    const depCourses = (allCourses || []).filter(c => (c.department || '').toLowerCase() === dName.toLowerCase() || (c.department || '').toLowerCase() === dCode.toLowerCase());

    return {
      name: dName,
      code: dCode,
      hod: hodName,
      description: d.description || '',
      studentCount: depStudents.length,
      facultyCount: depFaculty.length,
      coursesCount: depCourses.length
    };
  });

  // 8. Overall Institution Statistics
  const collegeEffectiveStudentPresent = collegeTotalStudentPresent + collegeTotalStudentOnDuty;
  const collegeOverallStudentAttendance = calcPct(collegeEffectiveStudentPresent, collegeTotalStudentClasses);
  const studentsWithShortage = fullStudentRoster.filter(s => s.attendance.percentage < 75 && s.attendance.totalClasses > 0);

  const institutionOverview = {
    totalStudents: studentUsers.length,
    totalFaculty: facultyUsers.length,
    totalDepartments: allDepartments.length,
    totalCourses: allCourses.length,
    totalAssignments: allAssignments.length,
    overallStudentAttendancePercentage: collegeOverallStudentAttendance,
    studentsWithAttendanceShortageCount: studentsWithShortage.length,
    studentsWithAttendanceShortage: studentsWithShortage.map(s => ({ name: s.name, rollNo: s.rollNo, studentId: s.studentId, department: s.department, percentage: s.attendance.percentage }))
  };

  // 9. Dynamic Auto-Discovery of any additional collections in DB
  const dynamicDatabaseEntities = {};
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

  // 10. NexusMind Institutional Digital Twin & Predictive Analytics
  const atRiskStudents = fullStudentRoster.filter(s => s.attendance.percentage < 75 || Number(s.cgpa || 7) < 5.0);

  let institutionalVelocity = 'STABLE';
  let projected30DayAttendance = collegeOverallStudentAttendance;
  if (dailyCollegeAttendance.length >= 3) {
    const recentDays = dailyCollegeAttendance.slice(0, 5);
    const recentTotal = recentDays.reduce((sum, d) => sum + (d.totalClasses || 0), 0);
    const recentPres = recentDays.reduce((sum, d) => sum + (d.presentClasses || 0), 0);
    const recentPct = calcPct(recentPres, recentTotal);
    if (recentPct > collegeOverallStudentAttendance + 2) institutionalVelocity = 'UPWARD';
    else if (recentPct < collegeOverallStudentAttendance - 2) institutionalVelocity = 'DOWNWARD';
    projected30DayAttendance = Math.round(((collegeOverallStudentAttendance * 0.4) + (recentPct * 0.6)) * 100) / 100;
  }

  const departmentHealthScores = departmentsSummary.map(d => {
    const depStudents = fullStudentRoster.filter(s => (s.department || '').toLowerCase() === d.name.toLowerCase() || (s.department || '').toLowerCase() === d.code.toLowerCase());
    const avgAtt = depStudents.length > 0
      ? calcPct(depStudents.reduce((sum, s) => sum + s.attendance.percentage, 0), depStudents.length * 100) * 100
      : 80;
    const shortageCount = depStudents.filter(s => s.attendance.percentage < 75).length;
    const healthScore = Math.max(0, Math.min(100, Math.round(avgAtt - (shortageCount * 5))));
    return {
      department: d.name,
      code: d.code,
      healthScore,
      status: healthScore >= 75 ? 'Healthy' : (healthScore >= 60 ? 'Moderate Concern' : 'Critical Action Required'),
      studentCount: depStudents.length,
      shortageCount
    };
  });

  const criticalDepts = departmentHealthScores.filter(d => d.healthScore < 65);
  const anomalyStatus = criticalDepts.length > 0 ? 'CRITICAL_DEPARTMENT_SHORTAGE_DETECTED' : (atRiskStudents.length > studentUsers.length * 0.2 ? 'ELEVATED_CAMPUS_SHORTAGE' : 'NOMINAL');

  const recommendedPolicyActions = [];
  if (criticalDepts.length > 0) {
    recommendedPolicyActions.push(`Issue strategic administrative reviews for ${criticalDepts.map(d => d.department).join(', ')} where department health has fallen below 65.`);
  }
  if (institutionalVelocity === 'DOWNWARD') {
    recommendedPolicyActions.push('Campus-wide attendance momentum is downward. Recommend launching an institutional attendance recovery drive and reviewing timetable density.');
  }
  if (atRiskStudents.length > 0) {
    recommendedPolicyActions.push(`Initiate centralized parent-guardian notifications for ${atRiskStudents.length} student(s) facing exam disqualification due to attendance shortage.`);
  }
  if (recommendedPolicyActions.length === 0) {
    recommendedPolicyActions.push('Institutional operations, department health indices, and attendance velocity are in optimal condition.');
  }

  const nexusMindIntelligence = {
    twinType: 'Institutional Digital Twin',
    institutionalVelocity,
    projected30DayAttendance,
    overallAttendance: collegeOverallStudentAttendance,
    atRiskStudentsCount: atRiskStudents.length,
    atRiskStudents: atRiskStudents.map(s => ({ name: s.name, rollNo: s.rollNo, department: s.department, attendancePct: s.attendance.percentage, cgpa: s.cgpa })),
    departmentHealthScores,
    anomalyStatus,
    recommendedPolicyActions
  };

  return {
    adminInfo: {
      name: resolveName(adminUser, 'Super Admin'),
      email: adminUser?.email || 'admin@erp.edu'
    },
    institutionOverview,
    departments: departmentsSummary,
    facultyRoster: fullFacultyRoster,
    studentRoster: fullStudentRoster,
    courses: (allCourses || []).map(c => ({
      code: normalizeField(c, ['code', 'courseCode'], 'N/A'),
      name: resolveName(c, 'Course'),
      credits: c.credits || 3,
      semester: c.semester || 'N/A',
      department: c.department || 'General',
      faculty: resolveName(c.faculty, 'Not Assigned')
    })),
    assignments: collegeAssignments,
    dailyCollegeAttendance,
    nexusMindIntelligence,
    dynamicDatabaseEntities
  };
}

/**
 * Match relative or explicit dates within an Admin's query
 */
function findDailyRecordInQuery(userQuery, dailyRecords = []) {
  const q = (userQuery || '').toLowerCase().trim();
  const now = new Date();

  // 1. "today"
  if (q.includes('today') || q.includes('todays') || q.includes("today's")) {
    const todayStr = now.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === todayStr);
    return { targetDateLabel: `Today (${todayStr})`, record: match, searchedKey: todayStr };
  }

  // 2. "yesterday"
  if (q.includes('yesterday') || q.includes('yesterdays') || q.includes("yesterday's")) {
    const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yStr = yDate.toISOString().split('T')[0];
    const match = dailyRecords.find(d => d.date === yStr);
    return { targetDateLabel: `Yesterday (${yStr})`, record: match, searchedKey: yStr };
  }

  // 3. ISO date YYYY-MM-DD
  const isoMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const dateStr = isoMatch[1];
    const match = dailyRecords.find(d => d.date === dateStr);
    return { targetDateLabel: dateStr, record: match, searchedKey: dateStr };
  }

  // 4. DD/MM/YYYY or DD-MM-YYYY
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

  return null;
}

/**
 * Concise Fallback Answer Generator for Admin queries (when Gemini LLM is offline)
 */
function generateFallbackAnswer(userQuery, ctx, relevantKnowledge = []) {
  const q = (userQuery || '').toLowerCase().trim();
  const isDetailed = /detail|breakdown|elaborate|full report|complete|in-depth|deep|all stats|full list|all students|all faculty|more about|tell me more|both/i.test(q);

  const overview = ctx.institutionOverview || {};
  const faculty = ctx.facultyRoster || [];
  const students = ctx.studentRoster || [];
  const depts = ctx.departments || [];
  const courses = ctx.courses || [];
  const assignments = ctx.assignments || [];
  const dailyLogs = ctx.dailyCollegeAttendance || [];

  // 1. Date specific query
  const dateMatchResult = findDailyRecordInQuery(userQuery, dailyLogs);
  if (dateMatchResult) {
    const { targetDateLabel, record } = dateMatchResult;
    if (!record) {
      return `No attendance records found for **${targetDateLabel}**.`;
    }

    const absentStudents = record.absentStudents || [];
    const presentStudents = record.presentStudents || [];

    if (!isDetailed) {
      const absentList = absentStudents.map(s => `**${s.name}** (${s.rollNo})`).join(', ');
      return `**${targetDateLabel} Attendance:** **${presentStudents.length}** students present, **${absentStudents.length}** absent.${absentStudents.length > 0 ? ` Absentees: ${absentList}.` : ' No absentees.'}`;
    }

    const absentTable = absentStudents.length > 0
      ? `\n\n**Absent Students (${absentStudents.length})**:\n` + absentStudents.map(s => `• ❌ **${s.name}** (\`${s.rollNo}\` / ID: \`${s.studentId}\`) — Absent in ${s.absentClasses} classes`).join('\n')
      : '\n\n✅ *No student absentees recorded for this date.*';

    return `📅 **College Attendance Register for ${targetDateLabel}**:\n\n• **Total Marked Classes**: ${record.totalMarked}\n• **Present Students**: ${presentStudents.length}\n• **Absent Students**: ${absentStudents.length}${absentTable}`;
  }

  // 2. Identify Matching Entities
  let matchedStudents = students.filter(s => {
    const nameParts = s.name.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    const nameMatch = nameParts.some(part => q.includes(part)) || q.includes(s.name.toLowerCase());
    const rollMatch = s.rollNo && s.rollNo !== 'N/A' && q.includes(s.rollNo.toLowerCase());
    const idMatch = s.studentId && s.studentId !== 'N/A' && q.includes(s.studentId.toLowerCase());
    return nameMatch || rollMatch || idMatch;
  });

  let matchedFacultyList = faculty.filter(f => {
    const nameParts = f.name.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    const nameMatch = nameParts.some(part => q.includes(part)) || q.includes(f.name.toLowerCase());
    const idMatch = f.facultyId && f.facultyId !== 'N/A' && q.includes(f.facultyId.toLowerCase());
    return nameMatch || idMatch;
  });

  const isAskingBoth = q.includes('both') || 
    (q.includes('student') && q.includes('faculty')) || 
    (q.includes('student') && q.includes('teacher')) ||
    q.includes('everyone') || 
    q.includes('all users') ||
    q.includes('student and faculty') ||
    q.includes('faculty and student') ||
    q.includes('both of them');

  // If asking for both or general combined info, include all students and faculty
  if (isAskingBoth) {
    if (matchedStudents.length === 0) matchedStudents = students;
    if (matchedFacultyList.length === 0) matchedFacultyList = faculty;
  }

  // If asking for students generally and no specific student was matched
  if (matchedStudents.length === 0 && !isAskingBoth && (q.includes('student') || q.includes('students') || q.includes('roll number') || q.includes('roll no') || q.includes('rollno') || q.includes('reg no') || q.includes('register number') || q.includes('student id') || q.includes('cgpa') || q.includes('gpa'))) {
    matchedStudents = students;
  }

  // If asking for faculty generally and no specific faculty was matched
  if (matchedFacultyList.length === 0 && !isAskingBoth && (q.includes('faculty') || q.includes('teacher') || q.includes('teachers') || q.includes('professor') || q.includes('professors') || q.includes('staff') || q.includes('faculty id') || q.includes('staff id'))) {
    matchedFacultyList = faculty;
  }

  // 3. DUAL ENTITY / COMBINED QUERY (Both Student and Faculty)
  if (isAskingBoth || (matchedStudents.length > 0 && matchedFacultyList.length > 0)) {
    const targetStudents = matchedStudents.length > 0 ? matchedStudents : students;
    const targetFaculty = matchedFacultyList.length > 0 ? matchedFacultyList : faculty;

    const studentBlocks = targetStudents.map(st => {
      if (isDetailed || q.includes('more') || q.includes('both') || q.includes('detail')) {
        return `### 🎓 Student: **${st.name}**\n- **Student ID**: \`${st.studentId}\` | **Roll No**: \`${st.rollNo}\` | **Register No**: \`${st.registerNumber}\`\n- **Contact / Phone**: **${st.phone}** | **Email**: ${st.email}\n- **Department & Semester**: ${st.department} (Semester ${st.semester})\n- **CGPA**: **${st.cgpa}**\n- **Overall Attendance**: **${st.attendance.percentage}%** (${st.attendance.status})`;
      }
      return `🎓 **Student:** **${st.name}** (ID: \`${st.studentId}\`, Phone: **${st.phone}**, Email: ${st.email}, Dept: ${st.department}, CGPA: **${st.cgpa}**, Attendance: **${st.attendance.percentage}%**)`;
    }).join('\n\n');

    const facultyBlocks = targetFaculty.map(fc => {
      const courseList = fc.assignedCourses.map(c => `\`${c.name}\``).join(', ') || 'None assigned';
      if (isDetailed || q.includes('more') || q.includes('both') || q.includes('detail')) {
        return `### 👨‍🏫 Faculty: **${fc.name}**\n- **Faculty ID**: \`${fc.facultyId}\` (Staff ID: \`${fc.staffId}\`)\n- **Designation & Department**: ${fc.designation}, ${fc.department}\n- **Assigned Courses**: ${courseList}\n- **Qualification**: ${fc.qualification} | **Experience**: ${fc.experience}\n- **Contact / Phone**: **${fc.phone}** | **Email**: ${fc.email}`;
      }
      return `👨‍🏫 **Faculty:** **${fc.name}** (ID: \`${fc.facultyId}\`, ${fc.designation}, Dept: ${fc.department}, Phone: **${fc.phone}**, Email: ${fc.email})`;
    }).join('\n\n');

    return `Here are the details for **both**:\n\n${studentBlocks}\n\n${facultyBlocks}`;
  }

  // 4. Query for ALL Faculty IDs
  if ((q.includes('faculty id') || q.includes('faculty ids') || q.includes('staff id') || q.includes('staff ids')) && (q.includes('all') || q.includes('list') || q.includes('every') || q.includes('show') || q === 'faculty ids' || q === 'faculty id')) {
    if (faculty.length === 0) return "No faculty members are currently registered.";
    if (!isDetailed) {
      const idList = faculty.map(f => `**${f.name}** (ID: \`${f.facultyId}\`)`).join(', ');
      return `**Faculty IDs (${faculty.length}):** ${idList}.`;
    }
    const tableRows = faculty.map(f => `| **${f.name}** | \`${f.facultyId}\` | ${f.department} | ${f.designation} | ${f.email} |`).join('\n');
    return `👨‍🏫 **All Faculty IDs & Department Directory**:\n\n| Faculty Name | Faculty ID | Department | Designation | Email |\n| :--- | :---: | :--- | :--- | :--- |\n${tableRows}`;
  }

  // 5. Query for ALL Student IDs
  if ((q.includes('student id') || q.includes('student ids') || q.includes('roll numbers') || q.includes('roll number') || q.includes('roll no')) && (q.includes('all') || q.includes('list') || q.includes('every') || q.includes('show') || q === 'student ids' || q === 'student id' || q === 'roll numbers')) {
    if (students.length === 0) return "No students are currently registered.";
    if (!isDetailed) {
      const idList = students.map(s => `**${s.name}** (ID: \`${s.studentId}\`, Roll: \`${s.rollNo}\`)`).join(', ');
      return `**Student IDs (${students.length}):** ${idList}.`;
    }
    const tableRows = students.map(s => `| **${s.name}** | \`${s.studentId}\` | \`${s.rollNo}\` | ${s.department} | Sem ${s.semester} | **${s.cgpa}** |`).join('\n');
    return `🎓 **All Student IDs & Academic Roster**:\n\n| Student Name | Student ID | Roll No | Department | Semester | CGPA |\n| :--- | :---: | :---: | :--- | :---: | :---: |\n${tableRows}`;
  }

  // 6. Multiple students matched
  if (matchedStudents.length > 1) {
    if (!isDetailed) {
      const list = matchedStudents.map(st => `**${st.name}** (ID: \`${st.studentId}\`, Phone: **${st.phone}**, CGPA: **${st.cgpa}**, Att: **${st.attendance.percentage}%**)`).join(' | ');
      return `Found **${matchedStudents.length}** students: ${list}.`;
    }
    const list = matchedStudents.map(st => `• 🎓 **${st.name}** (ID: \`${st.studentId}\`, Roll: \`${st.rollNo}\`, Phone: **${st.phone}**, Dept: ${st.department}, Sem: ${st.semester}, CGPA: **${st.cgpa}**, Attendance: **${st.attendance.percentage}%**)`).join('\n');
    return `Found **${matchedStudents.length}** students matching your query:\n\n${list}`;
  }

  // 7. Single Student Match
  if (matchedStudents.length === 1) {
    const matchedStudent = matchedStudents[0];
    if (q.includes('student id') || q.includes('studentid') || q.includes('roll no') || q.includes('roll number') || q.includes('roll') || q.includes('register no') || q.includes('reg no') || q.includes('id')) {
      return `The Student ID of **${matchedStudent.name}** is **${matchedStudent.studentId}** (Roll No: **${matchedStudent.rollNo}**, Register No: **${matchedStudent.registerNumber}**).`;
    }

    if (q.includes('phone') || q.includes('mobile') || q.includes('contact') || q.includes('number')) {
      return `**${matchedStudent.name}**'s contact number is **${matchedStudent.phone}** (Email: **${matchedStudent.email}**, Student ID: \`${matchedStudent.studentId}\`).`;
    }

    if (!isDetailed) {
      if (q.includes('attendance') || q.includes('shortage')) {
        return `**${matchedStudent.name}** (${matchedStudent.rollNo}) has an attendance of **${matchedStudent.attendance.percentage}%** (${matchedStudent.attendance.status}).`;
      }
      if (q.includes('cgpa') || q.includes('gpa') || q.includes('marks') || q.includes('grade')) {
        return `**${matchedStudent.name}** (${matchedStudent.rollNo}) has a CGPA of **${matchedStudent.cgpa}**.`;
      }
      if (q.includes('email')) {
        return `**${matchedStudent.name}**'s email is **${matchedStudent.email}** (Phone: ${matchedStudent.phone}).`;
      }
      return `**${matchedStudent.name}** | Student ID: \`${matchedStudent.studentId}\` | Contact: **${matchedStudent.phone}** | Email: **${matchedStudent.email}** | Dept: **${matchedStudent.department}** (Semester ${matchedStudent.semester}, Sec ${matchedStudent.section}) | Attendance: **${matchedStudent.attendance.percentage}%** | CGPA: **${matchedStudent.cgpa}**`;
    }

    // Detailed Student Report
    const subjList = matchedStudent.attendance.subjectWise.length > 0
      ? matchedStudent.attendance.subjectWise.map(s => `• **${s.subject}**: **${s.percentage}%** (${s.present + s.onDuty}/${s.total}) — *${s.status}*`).join('\n')
      : '• *No subject attendance records available*';

    return `👤 **${matchedStudent.name}**\n\n` +
      `• **Student ID**: \`${matchedStudent.studentId}\`\n` +
      `• **Roll Number**: \`${matchedStudent.rollNo}\`\n` +
      `• **Contact Number**: **${matchedStudent.phone}**\n` +
      `• **Email**: ${matchedStudent.email}\n` +
      `• **Department & Semester**: ${matchedStudent.department} (Semester ${matchedStudent.semester}, Section ${matchedStudent.section})\n` +
      `• **CGPA**: **${matchedStudent.cgpa}**\n` +
      `• **Overall Attendance**: **${matchedStudent.attendance.percentage}%** (${matchedStudent.attendance.effectivePresent}/${matchedStudent.attendance.totalClasses} classes)\n\n` +
      `📊 **Subject-Wise Attendance Breakdown**:\n${subjList}`;
  }

  // 8. Multiple faculty matched
  if (matchedFacultyList.length > 1) {
    if (!isDetailed) {
      const list = matchedFacultyList.map(fc => `**${fc.name}** (ID: \`${fc.facultyId}\`, ${fc.department})`).join(' | ');
      return `Found **${matchedFacultyList.length}** faculty members: ${list}.`;
    }
    const list = matchedFacultyList.map(fc => `• 👨‍🏫 **${fc.name}** (ID: \`${fc.facultyId}\`, ${fc.designation}, Dept: ${fc.department}, Email: ${fc.email})`).join('\n');
    return `Found **${matchedFacultyList.length}** faculty members matching your query:\n\n${list}`;
  }

  // 9. Single Faculty Match
  if (matchedFacultyList.length === 1) {
    const matchedFaculty = matchedFacultyList[0];
    if (q.includes('faculty id') || q.includes('facultyid') || q.includes('staff id') || q.includes('staffid') || q.includes('employee id') || q.includes('id')) {
      return `The Faculty ID of **${matchedFaculty.name}** is **${matchedFaculty.facultyId}** (Department: **${matchedFaculty.department}**).`;
    }
    if (q.includes('phone') || q.includes('mobile') || q.includes('contact') || q.includes('number')) {
      return `**${matchedFaculty.name}**'s contact number is **${matchedFaculty.phone}** (Email: **${matchedFaculty.email}**, Faculty ID: \`${matchedFaculty.facultyId}\`).`;
    }

    if (!isDetailed) {
      const courseList = matchedFaculty.assignedCourses.map(c => `**${c.name}** (${c.code})`).join(', ');
      return `**${matchedFaculty.name}** | Faculty ID: \`${matchedFaculty.facultyId}\` | Dept: **${matchedFaculty.department}** | Designation: **${matchedFaculty.designation}** | Email: **${matchedFaculty.email}** | Courses: ${courseList || 'None assigned'}`;
    }

    const coursesTable = matchedFaculty.assignedCourses.length > 0
      ? matchedFaculty.assignedCourses.map(c => `• **${c.name}** (\`${c.code}\`) — Sem ${c.semester}, Credits: ${c.credits}`).join('\n')
      : '• *No courses currently assigned*';

    return `👨‍🏫 **Faculty Profile: ${matchedFaculty.name}**\n\n` +
      `• **Faculty ID**: \`${matchedFaculty.facultyId}\`\n` +
      `• **Designation**: ${matchedFaculty.designation}\n` +
      `• **Department**: ${matchedFaculty.department}\n` +
      `• **Contact Number**: **${matchedFaculty.phone}**\n` +
      `• **Email**: ${matchedFaculty.email}\n` +
      `• **Qualification**: ${matchedFaculty.qualification} | **Experience**: ${matchedFaculty.experience}\n\n` +
      `📖 **Assigned Courses (${matchedFaculty.assignedCoursesCount})**:\n${coursesTable}`;
  }

  // 10. College-Wide Counts & Summary
  if (q.includes('how many student') || q.includes('total student') || q.includes('student count')) {
    return `There are currently **${overview.totalStudents || students.length}** students registered across all departments.`;
  }

  if (q.includes('how many faculty') || q.includes('total faculty') || q.includes('faculty count') || q.includes('teachers count')) {
    return `There are currently **${overview.totalFaculty || faculty.length}** faculty members registered in the college.`;
  }

  if (q.includes('how many department') || q.includes('total department') || q.includes('list department') || q.includes('department details') || q.includes('departments')) {
    if (!isDetailed) {
      const deptList = depts.map(d => `**${d.name}** (${d.code})`).join(', ');
      return `There are **${depts.length}** departments in the college: ${deptList}.`;
    }
    const list = depts.map(d => `• **${d.name}** (\`${d.code}\`) — HOD: **${d.hod}** | Students: ${d.studentCount}, Faculty: ${d.facultyCount}, Courses: ${d.coursesCount}`).join('\n');
    return `🏢 **College Departments Overview (${depts.length})**:\n\n${list}`;
  }

  if (q.includes('attendance shortage') || q.includes('below 75') || q.includes('shortage students')) {
    const shortageList = overview.studentsWithAttendanceShortage || [];
    if (shortageList.length === 0) return "🎉 Excellent! There are **0 students** currently below 75% attendance college-wide.";
    if (!isDetailed) {
      const names = shortageList.map(s => `**${s.name}** (${s.percentage}%)`).join(', ');
      return `There are **${shortageList.length}** student(s) with attendance shortage (<75%): ${names}.`;
    }
    const table = shortageList.map(s => `• ⚠️ **${s.name}** (\`${s.rollNo}\` / ID: \`${s.studentId}\`) — **${s.percentage}%** (${s.department})`).join('\n');
    return `🚨 **Students with Attendance Shortage (<75%) [${shortageList.length}]**:\n\n${table}`;
  }

  if (q.includes('overall attendance') || q.includes('college attendance') || q.includes('average attendance')) {
    return `The overall college-wide student attendance average is **${overview.overallStudentAttendancePercentage}%**.`;
  }

  if (q.includes('assignment') || q.includes('submission')) {
    if (assignments.length === 0) return "There are currently no assignments posted college-wide.";
    if (!isDetailed) {
      const list = assignments.map(a => `**${a.title}** (${a.submittedCount} submitted, ${a.pendingCount} pending)`).join(', ');
      return `There are **${assignments.length}** active assignments: ${list}.`;
    }
    const list = assignments.map(a => `• **${a.title}** (${a.courseName}) — Due: ${a.dueDate} | Submitted: **${a.submittedCount}**, Pending: **${a.pendingCount}** (Faculty: ${a.faculty})`).join('\n');
    return `📝 **College-Wide Coursework & Assignments (${assignments.length})**:\n\n${list}`;
  }

  // 11. Courses Query
  if (q.includes('course') || q.includes('subject') || q.includes('syllabus')) {
    if (courses.length === 0) return "There are currently no active courses registered.";
    if (!isDetailed) {
      const list = courses.map(c => `**${c.name}** (\`${c.code}\` - ${c.department})`).join(', ');
      return `There are **${courses.length}** active courses: ${list}.`;
    }
    const list = courses.map(c => `• **${c.name}** (\`${c.code}\`) — Dept: ${c.department}, Sem: ${c.semester}, Credits: ${c.credits}, Faculty: **${c.faculty}**`).join('\n');
    return `📚 **Institution Course Offerings (${courses.length})**:\n\n${list}`;
  }

  // 11b. NexusMind Institutional Digital Twin, Department Health & Prescriptive Guidance
  if (
    q.includes('health') ||
    q.includes('health score') ||
    q.includes('anomaly') ||
    q.includes('anomalies') ||
    q.includes('forecast') ||
    q.includes('velocity') ||
    q.includes('trajectory') ||
    q.includes('projection') ||
    q.includes('institutional twin') ||
    q.includes('improve') ||
    q.includes('policy') ||
    q.includes('actions') ||
    q.includes('recommendation')
  ) {
    const twin = ctx.nexusMindIntelligence || {};
    const depts = (twin.departmentHealthScores || []).map(d => `• **${d.department}** (${d.code}): **${d.healthScore}/100** — *${d.status}* (${d.shortageCount} shortages)`).join('\n');
    const actions = (twin.recommendedPolicyActions || []).map((a, i) => `${i + 1}. ${a}`).join('\n');

    return `🏛️ **NexusMind Institutional Digital Twin & Strategic Analytics**:\n\n` +
      `• **Campus Attendance Velocity:** **${twin.institutionalVelocity || 'STABLE'}**\n` +
      `• **Overall College Attendance:** **${twin.overallAttendance || 0}%**\n` +
      `• **30-Day Projected Attendance:** **${twin.projected30DayAttendance || 0}%**\n` +
      `• **Statistical Anomaly Status:** **${twin.anomalyStatus || 'NOMINAL'}**\n` +
      `• **Campus-Wide At-Risk Students:** **${twin.atRiskStudentsCount || 0} student(s)**\n\n` +
      `🏥 **Department Health Index (0-100)**:\n${depts}\n\n` +
      `💡 **Actionable Strategic Prescriptions (How to Improve)**:\n${actions}`;
  }

  // 11c. Interactive What-If Policy & Scenario Simulation
  if (
    q.includes('what if') ||
    q.includes('simulate') ||
    q.includes('simulation') ||
    q.includes('hypothetical') ||
    (q.includes('condonation') && (q.includes('70') || q.includes('relax')))
  ) {
    const thresholdMatch = q.match(/(\d{2})%/);
    const targetThreshold = thresholdMatch ? Number(thresholdMatch[1]) : 70;
    const holidayMatch = q.match(/(\d+)\s*(?:holiday|day|rain|snow)/);
    const holidays = holidayMatch ? Number(holidayMatch[1]) : 0;

    const cohort = (ctx.studentRoster || []).map(s => ({
      name: s.name,
      rollNo: s.rollNo,
      totalClasses: s.attendance?.totalClasses || 40,
      presentClasses: s.attendance?.presentClasses || 28,
      percentage: s.attendance?.percentage || 70
    }));

    const prevShortage = cohort.filter(s => s.percentage < 75).length;
    const simShortage = cohort.filter(s => {
      const tot = Math.max(1, s.totalClasses - holidays);
      const pct = Math.round((s.presentClasses / tot) * 100);
      return pct < targetThreshold;
    }).length;
    const retained = Math.max(0, prevShortage - simShortage);

    return `🧪 **NexusMind What-If Scenario Simulation Results**:\n\n` +
      `• **Simulated Policy Parameter**: Attendance Threshold = **${targetThreshold}%** ${holidays > 0 ? `| Unplanned Holidays = **${holidays} days**` : ''}\n` +
      `• **Baseline Shortage Students**: **${prevShortage}** (<75%)\n` +
      `• **Simulated Shortage Students**: **${simShortage}** (<${targetThreshold}%)\n` +
      `• **Net Students Retained / Saved**: **${retained} student(s)**\n\n` +
      (retained > 0
        ? `✅ *Impact Assessment: Relaxing the qualification criteria to ${targetThreshold}% prevents ${retained} student(s) from being debarred from semester examinations.*`
        : `ℹ️ *Impact Assessment: Parameter adjustment maintains current qualification levels without significant cohort shifts.*`);
  }

  // 12. Institutional Policy Match (only when explicitly relevant or high similarity)
  const isPolicyQuery = /policy|regulation|rule|grading scale|grade scale|minimum attendance|condonation|detention|safe range|exam weightage|how are marks|passing mark|program duration|how many semester/i.test(q);
  const institutionalMatch = (relevantKnowledge || []).find(k => isPolicyQuery ? k.similarityScore >= 0.20 : k.similarityScore >= 0.75);
  if (institutionalMatch) {
    return `📜 **${institutionalMatch.title}**\n\n${institutionalMatch.content}`;
  }

  // 13. Default
  return `I am your **Super Admin AI Assistant**. You can ask me any question about any faculty, any student (or both combined, including Student IDs, Roll Numbers, and Faculty IDs), college-wide attendance, marks, departments, or assignments. (Add *"in detail"* or *"more about both"* for full tabular breakdowns).`;
}

/**
 * Controller endpoint: POST /api/admin/ai/chat
 */
exports.chatWithAdminAi = async (req, res) => {
  try {
    const adminUserId = req.user?.id || req.user?._id || req.user?.sub;
    if (!adminUserId) {
      return res.status(401).json({ message: 'Admin User ID missing in request' });
    }

    const message = req.body?.message || '';
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Message string is required' });
    }

    // Parse attached file if present (ChatGPT-style file Q&A)
    let attachedFileText = '';
    let attachedFileName = '';
    if (req.file) {
      attachedFileName = req.file.originalname || 'Uploaded File';
      attachedFileText = await extractTextFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    // 1. Fetch Global Real-Time Context + Semantic RAG (institution docs + admin's own uploads)
    const [adminContext, relevantKnowledge] = await Promise.all([
      getAdminContext(adminUserId),
      searchKnowledgeBase(message, 5, 0.15, { userId: adminUserId, scope: 'admin' })
    ]);

    let aiReply = '';
    let modelUsed = 'Deterministic Rule Engine (Hybrid RAG)';

    // Always include all relevant knowledge (custom uploads + policy docs)
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
            ? '[CUSTOM UPLOADED DATA FROM ADMIN]\n' +
              customUploads.map((k, i) => `[Dataset ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
            : null,
          policyDocs.length > 0
            ? '[INSTITUTIONAL REGULATIONS & POLICIES]\n' +
              policyDocs.map((k, i) => `[Policy ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n')
            : null
        ].filter(Boolean).join('\n\n')
      : 'No matching knowledge documents found.';

    // 2. Invoke Google Gemini LLM if API Key is configured
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
You are the Super Admin AI Engine for Smart College ERP.
You possess complete, omniscient, administrative read access across ALL students, ALL faculty members, ALL courses, ALL departments, attendance registers, marks, assignments, submissions, and institutional regulations.

==================================================
[1. LIVE INSTITUTION-WIDE DATABASE CONTEXT (MongoDB - Zero Caching)]
${JSON.stringify(adminContext, null, 2)}
==================================================

==================================================
[2. KNOWLEDGE BASE — CUSTOM UPLOADS & INSTITUTIONAL POLICIES (Vector RAG)]
${knowledgeContextText}
==================================================
${attachedFileText ? `
==================================================
[3. ATTACHED FILE: "${attachedFileName}"]
The user has attached a file with this message. Here is the FULL content of the file — answer ANY question about it:

${attachedFileText}
==================================================
` : ''}
[ADMIN QUERY]
"${message}"

==================================================
[CRITICAL RULES: NATURAL PHRASING, DIRECT ANSWERS & NO DATABASE META-TALK]
==================================================

1. STRICT NATURAL TONE - NO DATABASE/META PHRASES:
   - NEVER start responses with or include phrases like:
     * "The database contains..."
     * "In the database..."
     * "According to the database..."
     * "The ERP database has..."
     * "There is one student in the database..."
     * "Found in the database..."
   - Speak directly, concisely, and naturally as an intelligent College Administrator / Assistant.

2. DIRECT ANSWERS WITH EXACT NUMBERS AND CONTACT DETAILS:
   - When asked for student details, numbers, or general info:
     * Directly provide the student's name, Student ID, Contact/Phone Number (e.g. 8700920579), Email, Department, Semester, Section, Attendance %, and CGPA cleanly.
     * Example concise response for "student details" or "tell me number and other details":
       "**Vinit Kumar Gupta** | Student ID: \`VI2023\` | Contact No: **8700920579** | Email: \`vinit121p@gmail.com\` | Department: **Information Technology** (Semester 1, Section A) | Attendance: **66.67%** (Shortage) | CGPA: **0.00**"
     * Example response for "what is his number?" or "phone number":
       "**Vinit Kumar Gupta**'s contact number is **8700920579** (Student ID: \`VI2023\`, Email: \`vinit121p@gmail.com\`)."

3. MANDATORY DUAL & MULTI-ENTITY RESPONSES (WHEN ASKED ABOUT BOTH):
   - If the admin asks about BOTH a student and a faculty member (or multiple students, or multiple faculty, or both categories, e.g. "tell me about Rahul and Dr. Alan", "give details of both", "give both of their details", "tell me more about both of them", "student and faculty details"):
     * You MUST provide information for BOTH entities in your response. NEVER omit one entity and only answer for the other.
     * Clearly format each entity under its own separate section:
       ### 🎓 Student Details
       - **[Student Name]** | ID: \`[Student ID]\` | Phone: **[Phone]** | Email: \`[Email]\` | Department: **[Dept]** (Semester [Sem], Section [Sec]) | CGPA: **[CGPA]** | Attendance: **[Att %]**
       
       ---
       
       ### 👨‍🏫 Faculty Details
       - **[Faculty Name]** | Faculty ID: \`[Faculty ID]\` | Phone: **[Phone]** | Email: \`[Email]\` | Department: **[Dept]** | Designation: **[Designation]** | Assigned Courses: **[Courses]**
   - If the admin asks "tell me more about both of them" or "give details of both in detail", provide comprehensive reports for BOTH entities.

4. DEFAULT CONCISE MODE:
   - Output the direct, crisp answer containing the requested facts/numbers/IDs/phone numbers.
   - Do NOT output extra unrequested giant tables or whole-database dumps unless asked.

5. DETAILED MODE (ONLY WHEN EXPLICITLY ASKED FOR "IN DETAIL" / "DETAILED" / "BREAKDOWN" / "MORE ABOUT BOTH"):
   - Provide complete structured markdown tables, student-by-student rosters, faculty workloads, marks matrices, and attendance registers.

6. 2-DECIMAL ATTENDANCE PERCENTAGE PRECISION:
   - Always format percentages with exact 2-decimal accuracy (e.g. **66.67%**, **82.35%**, **75.00%**).

7. GROUNDING IN DATABASE CONTEXT:
   - Base every single fact, name, ID, roll number, phone number, and metric directly on the provided live MongoDB context. Never fabricate data.

8. CUSTOM UPLOADED DATA PRIORITY:
   - If the question relates to any CUSTOM UPLOADED DATA shown in section [2], answer DIRECTLY from that uploaded dataset.
   - Treat the uploaded data as ground truth for any questions about that content.
   - If an admin uploaded a PDF, CSV, Excel, JSON, or any text file, and asks about it, pull your answer from that uploaded content.
   - Clearly reference the source document name when answering from uploaded data.

9. INSTITUTIONAL TWIN, PREDICTIONS & ACTIONABLE POLICY PRESCRIPTIONS:
   - When asked about campus forecast, attendance velocity, department health scores, statistical anomalies, or how to improve institutional performance:
   - Refer directly to the nexusMindIntelligence object provided in the database context.
   - Present the Department Health ratings (0-100), Campus Velocity, and Anomaly status.
   - Always conclude with concrete, numbered actionable policy recommendations for the administrative leadership on how to intervene and improve student retention and performance.

10. OMNISCIENT WHAT-IF POLICY & INSTITUTIONAL SIMULATIONS (ALL DOMAINS):
    - POLICY & ATTENDANCE THRESHOLDS: If asked "What if we relax attendance to 70% or 65%?" or "What if 3 unplanned holidays occur?": calculate the exact number of students retained/saved from examination debarment across departments.
    - FACULTY ALLOCATION & WORKLOAD: If asked "What if we assign N more faculty to Department X?" or "What if student intake increases by N?": evaluate teacher-student ratios, course coverage, and department health ratings.
    - ACADEMIC PERFORMANCE & RETENTION: If asked "What if remedial tutoring is mandated for at-risk students?" or "What if fee payment deadlines are extended?": project institutional pass rate shifts and cohort retention metrics.
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
        const offlineRes = await pythonMlClient.queryAdminOfflineLlm(message, adminContext, attachedFileText, attachedFileName, knowledgeContextText);
        if (offlineRes && offlineRes.reply) {
          aiReply = offlineRes.reply;
          modelUsed = offlineRes.model;
        } else {
          aiReply = generateFallbackAnswer(message, adminContext, relevantKnowledge);
        }
      }
    } else {
      const offlineRes = await pythonMlClient.queryAdminOfflineLlm(message, adminContext, attachedFileText, attachedFileName, knowledgeContextText);
      if (offlineRes && offlineRes.reply) {
        aiReply = offlineRes.reply;
        modelUsed = offlineRes.model;
      } else {
        aiReply = generateFallbackAnswer(message, adminContext, relevantKnowledge);
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
    console.error('[AdminAI Error]:', error);
    return res.status(500).json({
      message: 'Failed to process Admin AI chat request',
      error: error.message
    });
  }
};

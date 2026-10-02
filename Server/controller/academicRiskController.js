const Course = require('../models/Course');
const Marks = require('../models/Marks');
const Attendance = require('../models/Attendance');
const StudentProfile = require('../models/StudentProfile');
const Assignment = require('../models/Assignment');
const StudentSubmission = require('../models/StudentSubmission');
const User = require('../models/User');
const mongoose = require('mongoose');

// Helper: Calculate 4-factor risk score for a student in a specific course
function computeSubjectRisk({ attendancePct, marksPct, assignmentPct, cgpa = 7.5, backlogs = 0 }) {
  // 1. Attendance Factor (30%)
  let attRisk = 0;
  if (attendancePct < 75) {
    attRisk = Math.min(100, (75 - attendancePct) * 3.0 + 25);
  } else if (attendancePct < 80) {
    attRisk = (80 - attendancePct) * 3.0;
  }

  // 2. Assessment Marks Factor (35%)
  let marksRisk = 0;
  if (marksPct > 0) {
    if (marksPct < 40) {
      marksRisk = 100;
    } else if (marksPct < 60) {
      marksRisk = Math.min(100, (60 - marksPct) * 3.5 + 20);
    } else if (marksPct < 75) {
      marksRisk = (75 - marksPct) * 1.5;
    }
  } else {
    // If marks not entered yet, assign neutral baseline
    marksRisk = 20;
  }

  // 3. Assignment Performance Factor (20%)
  const assignRisk = Math.max(0, Math.min(100, (100 - assignmentPct) * 0.8));

  // 4. Previous Academic Performance / Backlog Factor (15%)
  const priorRisk = Math.max(0, Math.min(100, (7.0 - (cgpa || 7.0)) * 20 + (backlogs * 25)));

  const compositeScore = Math.round(
    0.30 * attRisk +
    0.35 * marksRisk +
    0.20 * assignRisk +
    0.15 * priorRisk
  );

  let level = 'LOW';
  let badgeColor = '#10b981'; // Green
  let label = 'Healthy Standing';

  if (compositeScore >= 60) {
    level = 'CRITICAL';
    badgeColor = '#ef4444'; // Red
    label = 'Critical Academic Risk';
  } else if (compositeScore >= 40) {
    level = 'HIGH';
    badgeColor = '#f97316'; // Orange
    label = 'High Attention Needed';
  } else if (compositeScore >= 20) {
    level = 'MODERATE';
    badgeColor = '#eab308'; // Yellow
    label = 'Moderate Risk';
  }

  // Actionable Insights
  const recommendations = [];
  if (attendancePct < 75) {
    recommendations.push(`Attendance is below 75% (${attendancePct}%). Attend upcoming sessions to prevent exam disqualification.`);
  }
  if (marksPct > 0 && marksPct < 50) {
    recommendations.push(`Internal marks are below standard (${marksPct}%). Schedule faculty office hours for remediation.`);
  }
  if (assignmentPct < 60) {
    recommendations.push(`Pending or low assignment submissions (${assignmentPct}%). Submit outstanding coursework.`);
  }
  if (backlogs > 0) {
    recommendations.push(`Student has ${backlogs} active backlog(s). Supplementary academic support advised.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Maintaining good academic trajectory across all evaluation factors.');
  }

  return {
    score: compositeScore,
    level,
    label,
    badgeColor,
    factors: {
      attendancePct: Math.round(attendancePct),
      marksPct: Math.round(marksPct),
      assignmentPct: Math.round(assignmentPct),
      cgpa: cgpa || 0,
      backlogs: backlogs || 0
    },
    recommendations
  };
}

// GET /api/student/academic-risk (Student's own multi-factor risk report)
async function getStudentAcademicRisk(req, res) {
  try {
    const studentId = req.user._id;

    // Fetch profile
    const profile = await StudentProfile.findOne({ user: studentId }).lean();
    const cgpa = profile?.cgpa || profile?.gpa || 7.2;
    const backlogs = profile?.backlogs || 0;

    // Fetch enrolled courses
    const courses = await Course.find({
      $or: [
        { students: studentId },
        { 'enrolledStudents.student': studentId }
      ]
    }).populate('faculty', 'firstName lastName email').lean();

    // Fetch all attendance for student
    const attendanceRecords = await Attendance.find({ userId: studentId }).lean();

    // Fetch student marks
    const marksRecords = await Marks.find({ studentId, isActive: true }).lean();

    // Fetch student submissions
    const submissions = await StudentSubmission.find({ studentId }).lean();

    // Calculate per-subject risk
    const subjectRisks = [];

    for (const course of courses) {
      // 1. Attendance for this course
      let totalCourseClasses = 0;
      let attendedCourseClasses = 0;

      for (const rec of attendanceRecords) {
        if (Array.isArray(rec.dailySchedule)) {
          for (const s of rec.dailySchedule) {
            const matchesCourse = (s.subject && course.name && s.subject.toLowerCase().includes(course.name.toLowerCase())) ||
                                  (s.subject && course.code && s.subject.toLowerCase().includes(course.code.toLowerCase()));
            if (matchesCourse) {
              totalCourseClasses++;
              if (s.status === 'PRESENT' || s.status === 'ON-DUTY') attendedCourseClasses++;
            }
          }
        }
      }

      // If no course-specific schedule matched, use overall student attendance as fallback
      let courseAttPct = 80;
      if (totalCourseClasses > 0) {
        courseAttPct = (attendedCourseClasses / totalCourseClasses) * 100;
      } else if (attendanceRecords.length > 0) {
        const total = attendanceRecords.reduce((acc, r) => acc + (r.totalClasses || 0), 0);
        const pres = attendanceRecords.reduce((acc, r) => acc + ((r.presentClasses || 0) + (r.onDutyClasses || 0)), 0);
        courseAttPct = total > 0 ? (pres / total) * 100 : 78;
      }

      // 2. Marks for this course
      const mark = marksRecords.find(m => m.courseId && m.courseId.toString() === course._id.toString());
      const marksPct = mark ? (mark.total || mark.semesterExam || 0) : 0;

      // 3. Assignments for this course
      const courseSubmissions = submissions.filter(s => s.courseId && s.courseId.toString() === course._id.toString());
      const assignPct = courseSubmissions.length > 0
        ? (courseSubmissions.filter(s => s.status === 'GRADED' || s.status === 'SUBMITTED').length / courseSubmissions.length) * 100
        : 75;

      const risk = computeSubjectRisk({
        attendancePct: courseAttPct,
        marksPct,
        assignmentPct: assignPct,
        cgpa,
        backlogs
      });

      subjectRisks.push({
        courseId: course._id,
        courseName: course.name,
        courseCode: course.code,
        facultyName: course.faculty ? `${course.faculty.firstName || ''} ${course.faculty.lastName || ''}`.trim() : 'Instructor',
        risk
      });
    }

    // Overall Aggregate Risk
    const avgScore = subjectRisks.length > 0
      ? Math.round(subjectRisks.reduce((a, b) => a + b.risk.score, 0) / subjectRisks.length)
      : 20;

    let overallLevel = 'LOW';
    if (avgScore >= 60) overallLevel = 'CRITICAL';
    else if (avgScore >= 40) overallLevel = 'HIGH';
    else if (avgScore >= 20) overallLevel = 'MODERATE';

    return res.json({
      studentId,
      overallAcademicHealth: 100 - avgScore,
      overallRiskScore: avgScore,
      overallLevel,
      subjects: subjectRisks
    });
  } catch (err) {
    console.error('getStudentAcademicRisk error:', err);
    return res.status(500).json({ message: 'Failed to compute academic risk', error: err.message });
  }
}

// GET /api/faculty/academic-risk/:courseId (Faculty view: At-risk students in a course)
async function getCourseAcademicRiskForFaculty(req, res) {
  try {
    const { courseId } = req.params;
    const facultyId = req.user._id;

    const course = await Course.findOne({ _id: courseId }).populate('students', 'firstName lastName email rollNo registerNumber').lean();
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const students = course.students || [];
    const studentIds = students.map(s => s._id);

    // Fetch all profiles, marks, submissions in parallel
    const [profiles, marks, allAttendance] = await Promise.all([
      StudentProfile.find({ user: { $in: studentIds } }).lean(),
      Marks.find({ courseId, studentId: { $in: studentIds } }).lean(),
      Attendance.find({ userId: { $in: studentIds } }).lean()
    ]);

    const rosterRisk = students.map(student => {
      const prof = profiles.find(p => p.user && p.user.toString() === student._id.toString());
      const mark = marks.find(m => m.studentId && m.studentId.toString() === student._id.toString());

      // Student attendance
      const stuAtt = allAttendance.filter(a => a.userId && a.userId.toString() === student._id.toString());
      const totalAtt = stuAtt.reduce((acc, r) => acc + (r.totalClasses || 0), 0);
      const presAtt = stuAtt.reduce((acc, r) => acc + ((r.presentClasses || 0) + (r.onDutyClasses || 0)), 0);
      const attPct = totalAtt > 0 ? (presAtt / totalAtt) * 100 : 75;

      const marksPct = mark ? (mark.total || 0) : 0;
      const cgpa = prof?.cgpa || prof?.gpa || 7.0;
      const backlogs = prof?.backlogs || 0;

      const risk = computeSubjectRisk({
        attendancePct: attPct,
        marksPct,
        assignmentPct: 80, // baseline
        cgpa,
        backlogs
      });

      return {
        studentId: student._id,
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student',
        rollNo: student.rollNo || student.registerNumber || 'N/A',
        email: student.email,
        marks: marksPct,
        attendance: Math.round(attPct),
        risk
      };
    });

    const atRiskStudents = rosterRisk.filter(r => r.risk.level === 'CRITICAL' || r.risk.level === 'HIGH');

    return res.json({
      courseId: course._id,
      courseName: course.name,
      totalEnrolled: students.length,
      atRiskCount: atRiskStudents.length,
      roster: rosterRisk.sort((a, b) => b.risk.score - a.risk.score)
    });
  } catch (err) {
    console.error('getCourseAcademicRiskForFaculty error:', err);
    return res.status(500).json({ message: 'Failed to retrieve course risk analysis', error: err.message });
  }
}

module.exports = {
  getStudentAcademicRisk,
  getCourseAcademicRiskForFaculty
};

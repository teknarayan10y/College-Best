const mongoose = require('mongoose');
const Marks = require('../models/Marks');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');

/**
 * GET /api/student/exams/marks
 * Fetches all evaluated subject-wise marks and overall academic exam performance
 * for the authenticated student.
 */
async function getStudentExamMarks(req, res) {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const studentObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

    // Optional semester filter from query params: ?semester=1..8 | all
    const semesterParam = (req.query?.semester || '').trim().toLowerCase();

    // 1. Fetch Student Profile
    const profile = await StudentProfile.findOne({
      $or: [
        { user: userId },
        ...(studentObjId ? [{ user: studentObjId }] : []),
        { user: String(userId) }
      ]
    }).lean().catch(() => null);

    const studentBranch = (profile?.branch || profile?.department || '').trim();
    const currentSemester = Number(profile?.semester) || 1;

    // 2. Fetch all Marks for the student
    const marksQuery = {
      $or: [
        { studentId: userId },
        ...(studentObjId ? [{ studentId: studentObjId }] : []),
        { studentId: String(userId) }
      ],
      isActive: true
    };

    if (semesterParam && semesterParam !== 'all') {
      const sNum = Number(semesterParam);
      if (Number.isFinite(sNum) && sNum > 0) {
        marksQuery.semester = sNum;
      }
    }

    const marksDocs = await Marks.find(marksQuery)
      .populate('courseId', 'name code credits semester department')
      .populate('facultyId', 'firstName lastName name email')
      .sort({ semester: 1, updatedAt: -1 })
      .lean()
      .catch(() => []);

    // 3. Fetch courses in student's branch/semester to show complete curriculum view
    const courseQuery = { isActive: true };
    if (studentBranch) {
      courseQuery.department = studentBranch;
    }
    if (semesterParam && semesterParam !== 'all') {
      const sNum = Number(semesterParam);
      if (Number.isFinite(sNum) && sNum > 0) {
        courseQuery.semester = sNum;
      }
    } else if (!semesterParam && currentSemester) {
      // Default to current semester courses if no param given
      courseQuery.semester = currentSemester;
    }

    const relevantCourses = await Course.find(courseQuery)
      .populate('faculty', 'firstName lastName name email')
      .sort({ semester: 1, name: 1 })
      .lean()
      .catch(() => []);

    // Build a map of marks by courseId string
    const marksByCourseId = new Map();
    const marksList = [];

    marksDocs.forEach((m) => {
      const course = m.courseId || {};
      const faculty = m.facultyId || {};
      const courseIdStr = (course._id || m.courseId || '').toString();

      const fName = `${faculty.firstName || ''} ${faculty.lastName || ''}`.trim() ||
        faculty.name ||
        faculty.email ||
        'Faculty Instructor';

      const semExam = Number(m.semesterExam) || 0;
      const assignment = Number(m.assignment) || 0;
      const practical = Number(m.practical) || 0;
      const total = Number(m.total) != null ? Number(m.total) : (semExam + assignment + practical);

      let grade = m.grade;
      if (!grade || grade === 'F' && total >= 40) {
        if (total >= 90) grade = 'O';
        else if (total >= 80) grade = 'A+';
        else if (total >= 70) grade = 'A';
        else if (total >= 60) grade = 'B+';
        else if (total >= 50) grade = 'B';
        else if (total >= 40) grade = 'C';
        else grade = 'F';
      }

      const isPass = total >= 40 && grade !== 'F';

      const item = {
        _id: m._id,
        courseId: course._id || m.courseId,
        subjectName: course.name || 'Subject',
        subjectCode: course.code || 'COURSE',
        credits: course.credits || 3,
        semester: m.semester || course.semester || currentSemester,
        department: course.department || studentBranch,
        facultyName: fName,
        facultyEmail: faculty.email || '',
        semesterExam: semExam,        // max 60
        maxSemesterExam: 60,
        assignment: assignment,        // max 20
        maxAssignment: 20,
        practical: practical,          // max 20
        maxPractical: 20,
        totalMarks: total,             // max 100
        maxTotal: 100,
        percentage: Math.min(100, Math.round(total)),
        grade,
        status: isPass ? 'PASS' : 'FAIL',
        isEvaluated: true,
        academicYear: m.academicYear || new Date().getFullYear().toString(),
        updatedAt: m.updatedAt || m.createdAt
      };

      if (courseIdStr) {
        marksByCourseId.set(courseIdStr, item);
      }
      marksList.push(item);
    });

    // Also include any registered courses that don't have marks yet, marked as "PENDING"
    const allSubjects = [...marksList];
    relevantCourses.forEach((c) => {
      const cIdStr = c._id.toString();
      if (!marksByCourseId.has(cIdStr)) {
        const fac = c.faculty || {};
        const fName = `${fac.firstName || ''} ${fac.lastName || ''}`.trim() || fac.name || fac.email || 'Assigned Faculty';
        allSubjects.push({
          _id: `pending_${cIdStr}`,
          courseId: c._id,
          subjectName: c.name,
          subjectCode: c.code,
          credits: c.credits || 3,
          semester: c.semester || currentSemester,
          department: c.department || studentBranch,
          facultyName: fName,
          facultyEmail: fac.email || '',
          semesterExam: 0,
          maxSemesterExam: 60,
          assignment: 0,
          maxAssignment: 20,
          practical: 0,
          maxPractical: 20,
          totalMarks: 0,
          maxTotal: 100,
          percentage: 0,
          grade: '-',
          status: 'PENDING',
          isEvaluated: false,
          academicYear: new Date().getFullYear().toString(),
          updatedAt: null
        });
      }
    });

    // Compute summary analytics over evaluated subjects
    let totalMarksSum = 0;
    let maxPossibleSum = 0;
    let totalCredits = 0;
    let earnedGradePoints = 0;

    const gradePointMap = {
      'O': 10,
      'A+': 9,
      'A': 8,
      'B+': 7,
      'B': 6,
      'C': 5,
      'F': 0
    };

    marksList.forEach((m) => {
      totalMarksSum += m.totalMarks;
      maxPossibleSum += m.maxTotal;
      const cred = m.credits || 3;
      totalCredits += cred;
      const gp = gradePointMap[m.grade] ?? 0;
      earnedGradePoints += (gp * cred);
    });

    const evaluatedCount = marksList.length;
    const avgPercentage = evaluatedCount > 0 ? Math.round((totalMarksSum / maxPossibleSum) * 100) : 0;
    const passedCount = marksList.filter(m => m.status === 'PASS').length;
    const failedCount = marksList.filter(m => m.status === 'FAIL').length;
    const sgpa = totalCredits > 0 ? Number((earnedGradePoints / totalCredits).toFixed(2)) : (profile?.cgpa || 8.5);

    let highestSubject = null;
    let lowestSubject = null;
    if (evaluatedCount > 0) {
      const sortedByMarks = [...marksList].sort((a, b) => b.totalMarks - a.totalMarks);
      highestSubject = {
        name: sortedByMarks[0].subjectName,
        code: sortedByMarks[0].subjectCode,
        marks: sortedByMarks[0].totalMarks,
        grade: sortedByMarks[0].grade
      };
      lowestSubject = {
        name: sortedByMarks[sortedByMarks.length - 1].subjectName,
        code: sortedByMarks[sortedByMarks.length - 1].subjectCode,
        marks: sortedByMarks[sortedByMarks.length - 1].totalMarks,
        grade: sortedByMarks[sortedByMarks.length - 1].grade
      };
    }

    let standing = 'N/A';
    if (evaluatedCount > 0) {
      if (failedCount > 0) standing = 'Backlog / Arrears';
      else if (avgPercentage >= 75) standing = 'First Class with Distinction';
      else if (avgPercentage >= 60) standing = 'First Class';
      else if (avgPercentage >= 50) standing = 'Second Class';
      else standing = 'Pass Class';
    }

    return res.json({
      message: 'Student exam marks retrieved successfully',
      student: {
        name: req.user?.name || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'Student',
        email: req.user?.email || '',
        rollNo: profile?.rollNo || profile?.registerNumber || '',
        registerNumber: profile?.registerNumber || '',
        branch: studentBranch,
        semester: currentSemester,
        academicYear: marksList[0]?.academicYear || new Date().getFullYear().toString()
      },
      marks: allSubjects,
      evaluatedMarks: marksList,
      summary: {
        totalSubjects: allSubjects.length,
        evaluatedSubjects: evaluatedCount,
        pendingSubjects: allSubjects.length - evaluatedCount,
        totalMarksScored: totalMarksSum,
        maxPossibleMarks: maxPossibleSum,
        averagePercentage: avgPercentage,
        sgpa,
        passedSubjects: passedCount,
        failedSubjects: failedCount,
        standing,
        highestSubject,
        lowestSubject
      }
    });
  } catch (error) {
    console.error('getStudentExamMarks error:', error);
    return res.status(500).json({
      message: 'Failed to retrieve student exam marks',
      error: error.message
    });
  }
}

module.exports = {
  getStudentExamMarks
};

const Marks = require('../models/Marks');
const Course = require('../models/Course');
const mongoose = require('mongoose');
const { createNotification } = require('./notificationController');

// Get marks for a course
async function facultyGetMarks(req, res) {
  try {
    console.log('=== GET MARKS REQUEST ===');
    const { courseId } = req.params;
    const facultyId = req.user?.id || req.user?._id;
    
    console.log('Getting marks for courseId:', courseId, 'facultyId:', facultyId);
    
    // Check if courseId is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log('Invalid courseId format:', courseId);
      return res.status(400).json({ message: 'Invalid course ID format' });
    }

    console.log('Looking for course with query:', { _id: courseId, faculty: facultyId });
    
    // Simple course verification
    const course = await Course.findOne({ _id: courseId, faculty: facultyId });
    console.log('Course query result:', course);
    
    if (!course) {
      console.log('Course not found or unauthorized');
      
      // Try to find course without faculty check to see if it exists
      const anyCourse = await Course.findOne({ _id: courseId });
      console.log('Course without faculty check:', anyCourse);
      
      if (!anyCourse) {
        return res.status(404).json({ message: 'Course not found' });
      } else {
        return res.status(403).json({ 
          message: 'Unauthorized to view marks for this course',
          debug: {
            courseId,
            facultyId,
            courseFaculty: anyCourse.faculty
          }
        });
      }
    }

    console.log('Course found:', course.name);

    // Get marks for this course and faculty
    const marks = await Marks.find({ 
      courseId, 
      facultyId,
      isActive: true 
    }).populate('studentId', 'firstName lastName email registerNumber rollNo');
    
    console.log('Found marks (raw):', marks);

    // Format marks for frontend
    const formattedMarks = {};
    marks.forEach(mark => {
      if (mark.studentId) {
        const sId = mark.studentId._id ? mark.studentId._id.toString() : mark.studentId.toString();
        formattedMarks[sId] = {
          'Semester Exam': mark.semesterExam ?? 0,
          'Assignment': mark.assignment ?? 0,
          'Practical': mark.practical ?? 0,
          semesterExam: mark.semesterExam ?? 0,
          assignment: mark.assignment ?? 0,
          practical: mark.practical ?? 0,
          total: mark.total ?? 0,
          grade: mark.grade || 'F'
        };
      }
    });

    console.log('Formatted marks:', formattedMarks);

    return res.json({ 
      message: 'Marks retrieved successfully',
      marks: formattedMarks,
      count: marks.length
    });
  } catch (error) {
    console.error('facultyGetMarks error:', error);
    return res.status(500).json({ 
      message: 'Failed to retrieve marks', 
      error: error.message,
      stack: error.stack
    });
  }
}

// Save marks for students
async function facultySaveMarks(req, res) {
  try {
    console.log('=== POST MARKS REQUEST ===');
    const { courseId, marks } = req.body;
    const facultyId = req.user?.id || req.user?._id;
    
    console.log('Request body:', req.body);
    console.log('User from request:', req.user);
    console.log('Extracted facultyId:', facultyId);
    console.log('Saving marks for courseId:', courseId);
    console.log('Marks data:', marks);
    
    if (!courseId || !marks || !Array.isArray(marks)) {
      console.log('Validation failed: Invalid request data');
      return res.status(400).json({ message: 'Invalid request data' });
    }

    // Check if courseId is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log('Invalid courseId format:', courseId);
      return res.status(400).json({ message: 'Invalid course ID format' });
    }

    console.log('Looking for course with query:', { _id: courseId, faculty: facultyId });
    
    // Simple course verification
    const course = await Course.findOne({ _id: courseId, faculty: facultyId });
    console.log('Course query result:', course);
    
    if (!course) {
      console.log('Course not found or unauthorized for save');
      
      // Try to find course without faculty check to see if it exists
      const anyCourse = await Course.findOne({ _id: courseId });
      console.log('Course without faculty check:', anyCourse);
      
      if (!anyCourse) {
        return res.status(404).json({ message: 'Course not found' });
      } else {
        return res.status(403).json({ 
          message: 'Unauthorized to modify this course marks',
          debug: {
            courseId,
            facultyId,
            courseFaculty: anyCourse.faculty
          }
        });
      }
    }

    console.log('Course found:', course.name);

    // Handle both entry and summary formats
    const currentYear = new Date().getFullYear().toString();
    const semester = course.semester || 1; // Use course semester if available

    // Save each student's marks one by one
    const results = [];
    for (const markData of marks) {
      try {
        let studentId, semesterExam, assignment, practical, total, grade;
        
        // Handle both formats
        if (markData.studentId && typeof markData.studentId === 'object') {
          // Summary format (from summary page)
          studentId = markData.studentId._id || markData.studentId;
          semesterExam = markData.semesterExam || markData['Semester Exam'] || 0;
          assignment = markData.assignment || markData['Assignment'] || 0;
          practical = markData.practical || markData['Practical'] || 0;
          total = markData.total || 0;
          grade = markData.grade || 'F';
        } else {
          // Entry format (from entry page)
          studentId = markData.studentId;
          semesterExam = markData.semesterExam || 0;
          assignment = markData.assignment || 0;
          practical = markData.practical || 0;
          total = markData.total || 0;
          grade = markData.grade || 'F';
        }
        
        console.log('Processing mark for student:', studentId);
        
        // Validate studentId
        if (!mongoose.Types.ObjectId.isValid(studentId)) {
          console.log('Invalid studentId:', studentId);
          results.push({ error: 'Invalid student ID', studentId });
          continue;
        }
        
        // Create marks document
        const marksDoc = {
          courseId,
          studentId,
          facultyId,
          semesterExam: Number(semesterExam) || 0,
          assignment: Number(assignment) || 0,
          practical: Number(practical) || 0,
          total: Number(total) || 0,
          grade: grade || 'F',
          semester,
          academicYear: currentYear
        };
        
        console.log('Creating marks document:', marksDoc);
        
        // Use findOneAndUpdate with upsert
        const result = await Marks.findOneAndUpdate(
          { courseId, studentId, facultyId },
          marksDoc,
          { upsert: true, new: true }
        );
        
        results.push(result);
        console.log('Save result for student', studentId, ':', result);

        // Automatically notify student in real-time about new / updated marks
        createNotification({
          recipientId: studentId,
          senderId: facultyId,
          type: 'MARKS_UPDATED',
          title: `Marks Published: ${course.name || 'Course'}`,
          message: `Your marks for ${course.name || 'Course'} have been recorded/updated. Total: ${marksDoc.total}/100 (Grade: ${marksDoc.grade}). Check your academic portal to verify.`,
          courseId: course._id,
          metadata: {
            courseName: course.name,
            semesterExam: marksDoc.semesterExam,
            assignment: marksDoc.assignment,
            practical: marksDoc.practical,
            total: marksDoc.total,
            grade: marksDoc.grade
          }
        }).catch(err => console.error('[Notification Trigger Error]', err));
      } catch (saveError) {
        console.error('Save error for student', studentId, ':', saveError);
        results.push({ error: saveError.message, studentId: markData.studentId });
      }
    }

    console.log('All save results:', results);

    // Check if any saves failed
    const failedSaves = results.filter(r => r.error);
    if (failedSaves.length > 0) {
      return res.status(500).json({ 
        message: 'Some marks failed to save', 
        failed: failedSaves
      });
    }

    return res.json({ 
      message: 'Marks saved successfully', 
      count: results.length,
      results: results
    });
  } catch (error) {
    console.error('facultySaveMarks error:', error);
    return res.status(500).json({ 
      message: 'Failed to save marks', 
      error: error.message,
      stack: error.stack
    });
  }
}

// Delete marks for a student
async function facultyDeleteMarks(req, res) {
  try {
    console.log('=== DELETE MARKS REQUEST ===');
    const { courseId, studentId } = req.params;
    const facultyId = req.user?.id || req.user?._id;
    
    console.log('Faculty ID:', facultyId);
    console.log('Course ID:', courseId);
    console.log('Student ID:', studentId);
    
    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      console.log('Invalid IDs - courseId:', courseId, 'studentId:', studentId);
      return res.status(400).json({ message: 'Invalid course or student ID' });
    }
    
    // Check if faculty is authorized for this course
    const course = await Course.findOne({ _id: courseId, faculty: facultyId });
    if (!course) {
      console.log('Faculty not authorized for course');
      return res.status(403).json({ message: 'Unauthorized to delete marks for this course' });
    }
    
    console.log('Faculty authorized for course:', course.name);
    
    // Delete the marks
    const result = await Marks.deleteOne({ courseId, studentId, facultyId });
    
    console.log('Delete result:', result);
    
    if (result.deletedCount === 0) {
      console.log('No marks found to delete');
      return res.status(404).json({ message: 'No marks found for this student' });
    }
    
    console.log('Marks deleted successfully');
    res.json({ message: 'Marks deleted successfully', deletedCount: result.deletedCount });
    
  } catch (error) {
    console.error('Delete marks error:', error);
    res.status(500).json({ 
      message: 'Failed to delete marks', 
      error: error.message,
      stack: error.stack
    });
  }
}


// AI Voice/Text Mark Entry: automatically parses roll number, scores, and updates student marks
async function facultyAiMarkEntry(req, res) {
  try {
    const { courseId, courseName, rollNo, semesterExam, assignment, practical } = req.body;
    const facultyId = req.user?.id || req.user?._id;

    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required for AI mark entry' });
    }

    // 1. Resolve Course
    let course = null;
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findOne({ _id: courseId, faculty: facultyId });
    }

    if (!course && courseName) {
      course = await Course.findOne({
        faculty: facultyId,
        $or: [
          { name: { $regex: new RegExp(courseName, 'i') } },
          { code: { $regex: new RegExp(courseName, 'i') } }
        ]
      });
    }

    if (!course) {
      // Fallback: pick the first active course assigned to this faculty
      const facultyCourses = await Course.find({ faculty: facultyId });
      if (facultyCourses.length === 1) {
        course = facultyCourses[0];
      } else if (facultyCourses.length > 1) {
        if (courseId) {
          course = facultyCourses.find(c => c._id.toString() === courseId.toString());
        }
        if (!course) {
          course = facultyCourses[0];
        }
      }
    }

    if (!course) {
      return res.status(404).json({ message: 'No course found associated with your faculty profile. Please select or create a course first.' });
    }

    // 2. Find Student by Roll Number or Register Number
    const StudentProfile = require('../models/StudentProfile');
    const User = require('../models/User');

    const rollStr = String(rollNo).trim();
    const cleanPattern = rollStr.replace(/[^a-zA-Z0-9]/g, '');

    // Search profile
    let profile = await StudentProfile.findOne({
      $or: [
        { rollNo: { $regex: new RegExp('^' + cleanPattern + '$', 'i') } },
        { registerNumber: { $regex: new RegExp('^' + cleanPattern + '$', 'i') } },
        { rollNo: { $regex: new RegExp(cleanPattern, 'i') } },
        { registerNumber: { $regex: new RegExp(cleanPattern, 'i') } }
      ]
    }).lean();

    let studentUserId = null;
    let studentName = 'Student';

    if (profile) {
      studentUserId = profile.user ? profile.user.toString() : null;
      if (studentUserId) {
        const u = await User.findById(studentUserId).select('firstName lastName name email').lean();
        if (u) {
          studentName = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.name || 'Student';
        }
      }
    }

    if (!studentUserId) {
      // Fallback: search in User collection
      const u = await User.findOne({
        $or: [
          { rollNo: { $regex: new RegExp('^' + cleanPattern + '$', 'i') } },
          { registerNumber: { $regex: new RegExp('^' + cleanPattern + '$', 'i') } },
          { email: { $regex: new RegExp('^' + cleanPattern, 'i') } }
        ]
      }).select('_id firstName lastName name email').lean();

      if (u) {
        studentUserId = u._id.toString();
        studentName = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.name || 'Student';
      }
    }

    if (!studentUserId) {
      return res.status(404).json({ message: 'No student found with roll number / register number: ' + rollNo });
    }

    // 3. Normalize & calculate marks
    const se = Math.min(60, Math.max(0, Number(semesterExam) || 0));
    const as = Math.min(20, Math.max(0, Number(assignment) || 0));
    const pr = Math.min(20, Math.max(0, Number(practical) || 0));
    const total = se + as + pr;

    function calcGrade(tot) {
      if (tot >= 95) return 'O';
      if (tot >= 90) return 'A+';
      if (tot >= 80) return 'A';
      if (tot >= 70) return 'B+';
      if (tot >= 60) return 'B';
      if (tot >= 50) return 'C';
      return 'F';
    }

    const grade = calcGrade(total);
    const semester = Number(course.semester) || 1;
    const academicYear = new Date().getFullYear().toString();

    const marksDoc = {
      courseId: course._id,
      studentId: studentUserId,
      facultyId,
      semesterExam: se,
      assignment: as,
      practical: pr,
      total,
      grade,
      semester,
      academicYear,
      isActive: true
    };

    const savedRecord = await Marks.findOneAndUpdate(
      { courseId: course._id, studentId: studentUserId, facultyId },
      marksDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 4. Trigger student notification
    try {
      const { createNotification } = require('./notificationController');
      createNotification({
        recipientId: studentUserId,
        senderId: facultyId,
        type: 'MARKS_UPDATED',
        title: 'Marks Published: ' + course.name,
        message: 'Your marks for ' + course.name + ' have been updated. Semester: ' + se + '/60, Assignment: ' + as + '/20, Practical: ' + pr + '/20. Total: ' + total + '/100 (Grade: ' + grade + ').',
        courseId: course._id,
        metadata: {
          courseName: course.name,
          semesterExam: se,
          assignment: as,
          practical: pr,
          total,
          grade
        }
      }).catch(e => console.error('[Notification Trigger Notice]', e.message));
    } catch (notifErr) {
      // ignore
    }

    return res.json({
      success: true,
      studentName,
      rollNo: rollStr,
      courseName: course.name,
      courseId: course._id,
      semesterExam: se,
      assignment: as,
      practical: pr,
      total,
      grade,
      marksRecordId: savedRecord._id,
      message: 'Marks recorded successfully for ' + studentName + ' (' + rollStr + ')'
    });

  } catch (error) {
    console.error('facultyAiMarkEntry error:', error);
    return res.status(500).json({ message: 'Failed to record marks', error: error.message });
  }
}

module.exports = {
  facultyAiMarkEntry,
  facultyGetMarks,
  facultySaveMarks,
  facultyDeleteMarks
};
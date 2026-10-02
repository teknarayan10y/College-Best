const Marks = require('../models/Marks');
const Course = require('../models/Course');
const mongoose = require('mongoose');

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
        formattedMarks[mark.studentId._id] = {
          'Semester Exam': mark.semesterExam || 0,
          'Assignment': mark.assignment || 0,
          'Practical': mark.practical || 0
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

module.exports = {
  facultyGetMarks,
  facultySaveMarks,
  facultyDeleteMarks
};
// src/features/faculty/FacultyMarksSummary.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import './FacultyMarksEntry.css';

function getCourseId(c) {
  return (c && (c._id || c.id || c.courseId || (c.course && c.course._id))) || '';
}

function getStudentId(student) {
  // Get the actual student ID, not fallback to '0'
  return student?._id || student?.userId || student?.id || student?.user?._id || student?.user?.id || student?.studentId;
}

function displayName(p) {
  const u = p?.user || {};
  const prof = p?.profile || {};
  const first = prof.firstName || u.firstName || '';
  const last  = prof.lastName  || u.lastName  || '';
  const idLike = prof.registerNumber || prof.rollNo || '';
  return (first + ' ' + last).trim() || idLike || u.email || 'Unknown';
}

function getGradeClassName(grade) {
  switch(grade) {
    case 'A+': return 'grade-aplus';
    case 'B+': return 'grade-bplus';
    default: return `grade-${grade.toLowerCase()}`;
  }
}

function validateMarksData(marks, selectedCourse) {
  if (!selectedCourse) {
    return { valid: false, message: 'Please select a course first' };
  }
  
  if (!marks || Object.keys(marks).length === 0) {
    return { valid: false, message: 'No marks to save' };
  }
  
  // Check if any marks are entered
  let hasMarks = false;
  for (const [studentId, studentMarks] of Object.entries(marks)) {
    for (const [examType, value] of Object.entries(studentMarks)) {
      if (value && value > 0) {
        hasMarks = true;
        break;
      }
    }
    if (hasMarks) break;
  }
  
  if (!hasMarks) {
    return { valid: false, message: 'Please enter at least one mark before saving' };
  }
  
  return { valid: true };
}

// Helper function to validate ObjectId
function isValidObjectId(id) {
  return id && 
         typeof id === 'string' && 
         id.length === 24 && 
         /^[0-9a-fA-F]{24}$/.test(id);
}

export default function FacultyMarksSummary() {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [originalMarks, setOriginalMarks] = useState({}); // Store original marks for comparison
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false); // Added missing state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [editMarks, setEditMarks] = useState({});

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadStudents();
      loadMarks();
    }
  }, [selectedCourse]);

  async function loadCourses() {
    try {
      const crs = await api.facultyCourses();
      console.log('Loaded courses in summary:', crs);
      const all = crs?.courses || crs?.items || [];
      setCourses(all);
      if (all.length && !selectedCourse) {
        const firstId = getCourseId(all[0]);
        if (firstId) setSelectedCourse(firstId);
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
      setError('Failed to load courses');
    }
  }

  async function loadStudents() {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const r = await api.facultyCourseStudents(selectedCourse);
      console.log('Loaded students in summary:', r);
      setStudents(Array.isArray(r?.items) ? r.items : (r?.students || []));
    } catch (err) {
      console.error('Failed to load students:', err);
      setError('Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadMarks() {
    if (!selectedCourse) return;
    try {
      const r = await api.facultyMarksGet(selectedCourse);
      console.log('Loaded marks in summary:', r);
      console.log('Marks data structure:', JSON.stringify(r?.marks, null, 2));
      
      const loadedMarks = r?.marks || {};
      setMarks(loadedMarks);
      setOriginalMarks(loadedMarks); // Store original marks for comparison
      
      // Debug: Check if marks have data
      console.log('Number of students with marks:', Object.keys(loadedMarks).length);
      console.log('Sample mark entry:', Object.keys(loadedMarks)[0], loadedMarks[Object.keys(loadedMarks)[0]]);
      
    } catch (err) {
      console.error('Failed to load marks:', err);
      if (err?.status === 404) {
        console.log('No marks found for this course');
        setMarks({});
        setOriginalMarks({});
      } else if (err?.status === 403) {
        if (err?.debug) {
          setError(`Unauthorized: You are not assigned as faculty for this course. (Faculty ID: ${err.debug.facultyId})`);
        } else {
          setError('You are not authorized to view marks for this course.');
        }
        setMarks({});
        setOriginalMarks({});
      } else {
        setError('Failed to load marks');
        setMarks({});
        setOriginalMarks({});
      }
    }
  }

  function handleEditMark(studentId, examType, value) {
    const numValue = Math.max(0, Math.min(
      examType === 'Semester Exam' ? 60 : 20, 
      Number(value) || 0
    ));
    setEditMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [examType]: numValue
      }
    }));
  }

  async function deleteStudentMarks(studentId) {
    if (!selectedCourse) {
      setError('Please select a course first');
      return;
    }

    const student = students.find(s => getStudentId(s) === studentId);
    const studentName = displayName(student);

    const confirmed = window.confirm(
      `⚠️ WARNING: This will permanently delete ALL marks for ${studentName} from the database. This action cannot be undone!\n\nAre you sure you want to delete marks for ${studentName}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      console.log('=== DELETE MARKS DEBUG ===');
      console.log('Deleting marks for student:', studentId);
      console.log('Selected course:', selectedCourse);
      
      // Use the API function
      const result = await api.facultyDeleteMarks(selectedCourse, studentId);
      console.log('Delete result:', result);
      
      setSuccess(`Successfully deleted marks for ${studentName}!`);
      
      // Reload marks to show updated data
      await loadMarks();
      await loadStudents();
      
    } catch (err) {
      console.error('=== DELETE ERROR DETAILS ===');
      console.error('Error:', err);
      console.error('Status:', err?.status);
      console.error('Message:', err?.message);
      console.error('========================');
      
      // More specific error messages
      if (err?.status === 404) {
        setError('Delete endpoint not found. Please check if the backend route exists: DELETE /api/faculty/marks/:courseId/:studentId');
      } else if (err?.status === 403) {
        setError('You are not authorized to delete marks for this course.');
      } else if (err?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err?.status === 500) {
        setError('Server error occurred while deleting marks. Please check server logs.');
      } else {
        setError(`Failed to delete marks: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEditedMarks() {
    setSaving(true);
    setEditing(false);
    setError('');
    setSuccess('');
    
    try {
      // Only process students who have been edited
      const editedStudents = Object.keys(editMarks);
      
      if (editedStudents.length === 0) {
        setError('No changes detected to save');
        setEditing(true);
        return;
      }

      // Create payload with only changed marks
      const marksArray = editedStudents.map(studentId => {
        const editedStudentMarks = editMarks[studentId] || {};
        const originalStudentMarks = originalMarks[studentId] || {};
        
        // Create complete marks object, preserving unchanged values
        const completeMarks = {
          semesterExam: editedStudentMarks['Semester Exam'] !== undefined 
            ? editedStudentMarks['Semester Exam'] 
            : (originalStudentMarks['Semester Exam'] || 0),
          assignment: editedStudentMarks['Assignment'] !== undefined 
            ? editedStudentMarks['Assignment'] 
            : (originalStudentMarks['Assignment'] || 0),
          practical: editedStudentMarks['Practical'] !== undefined 
            ? editedStudentMarks['Practical'] 
            : (originalStudentMarks['Practical'] || 0)
        };
        
        const total = completeMarks.semesterExam + completeMarks.assignment + completeMarks.practical;
        
        return {
          studentId,
          semesterExam: completeMarks.semesterExam,
          assignment: completeMarks.assignment,
          practical: completeMarks.practical,
          total: total,
          grade: calculateGrade(total)
        };
      });

      const payload = {
        courseId: selectedCourse,
        marks: marksArray
      };

      console.log('=== PARTIAL UPDATE DEBUG ===');
      console.log('Edited students:', editedStudents);
      console.log('Edit marks data:', editMarks);
      console.log('Original marks data:', originalMarks);
      console.log('Final payload:', payload);
      console.log('==========================');

      await api.facultyMarksSave(payload);
      setSuccess('Marks updated successfully!');
      
      // Reload marks to get updated data
      await loadMarks();
      setEditMarks({});
      
    } catch (err) {
      console.error('Save error:', err);
      if (err?.status === 404) {
        setError('Marks save API endpoint not implemented yet. Please contact administrator.');
      } else if (err?.status === 403) {
        if (err?.debug) {
          setError(`Unauthorized: You are not assigned as faculty for this course. (Faculty ID: ${err.debug.facultyId})`);
        } else {
          setError('You are not authorized to save marks for this course.');
        }
      } else {
        setError(err?.message || 'Failed to update marks');
      }
      setEditing(true); // Re-enable editing on error
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setEditMarks({});
    setSuccess('');
  }

  const courseName = useMemo(() => {
    const course = courses.find(c => getCourseId(c) === selectedCourse);
    return course?.name || 'Select Course';
  }, [courses, selectedCourse]);

  const selectedCourseData = useMemo(() => {
    const course = courses.find(c => getCourseId(c) === selectedCourse);
    return course || {};
  }, [courses, selectedCourse]);

  function calculateGrade(total) {
    if (total >= 95) return 'O';
    if (total >= 90) return 'A+';
    if (total >= 80) return 'A';
    if (total >= 70) return 'B+';
    if (total >= 60) return 'B';
    if (total >= 50) return 'C';
    return 'F';
  }

  function calculateTotal(studentId) {
    const studentMarks = marks[studentId] || {};
    let total = 0;
    total += studentMarks['Semester Exam'] || 0;
    total += studentMarks['Assignment'] || 0;
    total += studentMarks['Practical'] || 0;
    return Math.min(100, total);
  }

  // Enhanced filtering logic with better debugging
  const studentsWithMarks = useMemo(() => {
    console.log('=== DEBUG STUDENT MARKS ===');
    console.log('Total students:', students.length);
    console.log('Marks keys:', Object.keys(marks));
    console.log('Marks data:', marks);
    
    if (!students.length || Object.keys(marks).length === 0) {
      console.log('No students or no marks data');
      return [];
    }

    const result = students.filter((student, idx) => {
      const studentId = getStudentId(student);
      console.log(`Checking student ${idx}:`, studentId);
      console.log(`Student data:`, student);
      
      // Check if student has valid ID
      if (!studentId || !isValidObjectId(studentId)) {
        console.log(`Skipping invalid student ID: ${studentId}`);
        return false;
      }
      
      // Check if student has marks - enhanced logic
      const studentMarks = marks[studentId];
      console.log(`Marks for student ${studentId}:`, studentMarks);
      
      let hasMarks = false;
      if (studentMarks) {
        const markKeys = Object.keys(studentMarks);
        console.log(`Mark keys for student ${studentId}:`, markKeys);
        
        // Check if any mark has a value > 0
        hasMarks = markKeys.some(key => {
          const value = studentMarks[key];
          const hasValue = value !== undefined && value !== null && value > 0;
          console.log(`Mark ${key}: ${value} -> hasValue: ${hasValue}`);
          return hasValue;
        });
      }
      
      console.log(`Student ${studentId} has marks: ${hasMarks}`);
      return hasMarks;
    });
    
    console.log('Final filtered students:', result.length);
    console.log('==============================');
    return result;
  }, [students, marks]);

  // Calculate current total and grade for display (including edits)
  function getDisplayTotal(studentId) {
    const originalStudentMarks = marks[studentId] || {};
    const editedStudentMarks = editMarks[studentId] || {};
    
    const semesterExam = editedStudentMarks['Semester Exam'] !== undefined 
      ? editedStudentMarks['Semester Exam'] 
      : (originalStudentMarks['Semester Exam'] || 0);
    const assignment = editedStudentMarks['Assignment'] !== undefined 
      ? editedStudentMarks['Assignment'] 
      : (originalStudentMarks['Assignment'] || 0);
    const practical = editedStudentMarks['Practical'] !== undefined 
      ? editedStudentMarks['Practical'] 
      : (originalStudentMarks['Practical'] || 0);
    
    return semesterExam + assignment + practical;
  }

  function getDisplayGrade(studentId) {
    return calculateGrade(getDisplayTotal(studentId));
  }

  return (
    <div className="faculty">
      <div className="card wide">
      
<div className="marks-header">
  <div className="mobile-header-content">
    <div className="mobile-title-section">
      <h2>Marks Summary</h2>
      {selectedCourse && (
        <div className="mobile-course-info">
          <p className="header-subject">Subject: {courseName}</p>
          <div className="mobile-stats-row">
            <div className="mobile-stat-item">
              <span className="stat-label-small">Total Students</span>
              <span className="stat-number">{students.length}</span>
            </div>
            <div className="mobile-stat-item">
              <span className="stat-label-small">With Marks</span>
              <span className="stat-number">{studentsWithMarks.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
</div>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <div className="marks-controls">
          <div className="control-group">
            <label className="fd-label">Course</label>
            <select
              className="fd-input"
              value={selectedCourse}
              onChange={e => setSelectedCourse(e.target.value)}
            >
              <option value="">Select course</option>
              {courses.map(c => {
                const cid = getCourseId(c);
                return <option key={cid} value={cid}>{c.name || cid}</option>;
              })}
            </select>
          </div>

          <div className="control-group">
            <label className="fd-label">Subject Information</label>
            <div className="subject-info">
              {selectedCourse ? (
                <div className="subject-details">
                  <div className="subject-name">
                    <strong>Subject:</strong> {courseName}
                  </div>
                  <div className="marks-count">
                    <strong>Total Students:</strong> {students.length} | 
                    <strong>Students with Marks:</strong> {studentsWithMarks.length}
                  </div>
                </div>
              ) : (
                <div className="no-subject-selected">Select a course to view subject details</div>
              )}
            </div>
          </div>
        </div>

        {selectedCourse && (
          <div className="marks-section">
            <div className="marks-header-actions">
              <h3>Saved Marks for {courseName}</h3>
              {!editing ? (
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <i className="fas fa-edit"></i> Edit Marks
                </button>
              ) : (
                <div className="edit-actions">
                  <button className="btn btn-success" onClick={saveEditedMarks} disabled={saving}>
                    <i className="fas fa-save"></i> Save Changes
                  </button>
                  <button className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                    <i className="fas fa-times"></i> Cancel
                  </button>
                </div>
              )}
            </div>
            
            {loading ? (
              <div className="loading">Loading marks...</div>
            ) : students.length === 0 ? (
              <div className="empty-hint">No students found in this course</div>
            ) : Object.keys(marks).length === 0 ? (
              <div className="empty-hint">No marks saved yet for this course</div>
            ) : studentsWithMarks.length === 0 ? (
              <div className="empty-hint">
                No students with marks found. Please save some marks first from the marks entry page.
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="marks-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Reg/Roll No</th>
                      <th>Semester Exam<br/>(60)</th>
                      <th>Assignment<br/>(20)</th>
                      <th>Practical<br/>(20)</th>
                      <th>Total<br/>(100)</th>
                      <th>Grade</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsWithMarks.map((student, idx) => {
                      const studentId = getStudentId(student);
                      const studentMarks = marks[studentId] || {};
                      const prof = student?.profile || {};
                      const regNo = prof.registerNumber || prof.rollNo || '-';
                      
                      // Get display values (original or edited)
                      const displayTotal = getDisplayTotal(studentId);
                      const displayGrade = getDisplayGrade(studentId);
                      
                      return (
                        <tr key={studentId}>
                          <td className="student-name">{displayName(student)}</td>
                          <td className="reg-no">{regNo}</td>
                          <td className="mark-value">
                            {editing ? (
                              <input
                                type="number"
                                className="edit-input"
                                min="0"
                                max="60"
                                value={editMarks[studentId]?.['Semester Exam'] ?? studentMarks['Semester Exam'] ?? 0}
                                onChange={(e) => handleEditMark(studentId, 'Semester Exam', e.target.value)}
                              />
                            ) : (
                              <span>{studentMarks['Semester Exam'] || 0}</span>
                            )}
                          </td>
                          <td className="mark-value">
                            {editing ? (
                              <input
                                type="number"
                                className="edit-input"
                                min="0"
                                max="20"
                                value={editMarks[studentId]?.['Assignment'] ?? studentMarks['Assignment'] ?? 0}
                                onChange={(e) => handleEditMark(studentId, 'Assignment', e.target.value)}
                              />
                            ) : (
                              <span>{studentMarks['Assignment'] || 0}</span>
                            )}
                          </td>
                          <td className="mark-value">
                            {editing ? (
                              <input
                                type="number"
                                className="edit-input"
                                min="0"
                                max="20"
                                value={editMarks[studentId]?.['Practical'] ?? studentMarks['Practical'] ?? 0}
                                onChange={(e) => handleEditMark(studentId, 'Practical', e.target.value)}
                              />
                            ) : (
                              <span>{studentMarks['Practical'] || 0}</span>
                            )}
                          </td>
                          <td className="total-marks">
                            <strong>{displayTotal}</strong>
                          </td>
                          <td className={`grade ${getGradeClassName(displayGrade)}`}>
                            <strong>{displayGrade}</strong>
                          </td>
                          <td className="actions">
                            {editing ? (
                              <div className="edit-actions">
                                <button 
                                  className="btn btn-sm btn-success" 
                                  onClick={saveEditedMarks}
                                  disabled={saving}
                                >
                                  <i className="fas fa-save"></i> Save
                                </button>
                                <button 
                                  className="btn btn-sm btn-secondary" 
                                  onClick={cancelEdit}
                                  disabled={saving}
                                >
                                  <i className="fas fa-times"></i> Cancel
                                </button>
                                <button 
                                  className="btn btn-sm btn-danger" 
                                  onClick={() => {
                                    setEditMarks(prev => {
                                      const newEditMarks = { ...prev };
                                      delete newEditMarks[studentId];
                                      return newEditMarks;
                                    });
                                  }}
                                >
                                  <i className="fas fa-undo"></i> Reset
                                </button>
                              </div>
                            ) : (
                              <div className="view-actions">
                                <button 
                                  className="btn btn-sm btn-primary" 
                                  onClick={() => setEditing(true)}
                                >
                                  <i className="fas fa-edit"></i> Edit
                                </button>
                                <button 
                                  className="btn btn-sm btn-danger" 
                                  onClick={() => deleteStudentMarks(studentId)}
                                  disabled={saving}
                                >
                                  <i className="fas fa-trash"></i> Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="marks-legend">
          <h4>Grade Legend</h4>
          <div className="grade-list">
            <span className="grade-item">O: 95-100</span>
            <span className="grade-item">A+: 90-94</span>
            <span className="grade-item">A: 80-89</span>
            <span className="grade-item">B+: 70-79</span>
            <span className="grade-item">B: 60-69</span>
            <span className="grade-item">C: 50-59</span>
            <span className="grade-item fail">F: Below 50</span>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../../auth/api';
import './FacultyMarksEntry.css';

function getCourseId(c) {
  return (c && (c._id || c.id || c.courseId || (c.course && c.course._id))) || '';
}

function displayName(p) {
  const u = p?.user || {};
  const prof = p?.profile || {};
  const first = prof.firstName || u.firstName || '';
  const last = prof.lastName || u.lastName || '';
  const idLike = prof.registerNumber || prof.rollNo || '';
  return (first + ' ' + last).trim() || idLike || u.email || 'Unknown';
}

function getGradeClassName(grade) {
  switch (grade) {
    case 'A+': return 'grade-aplus';
    case 'B+': return 'grade-bplus';
    default: return `grade-${grade.toLowerCase()}`;
  }
}

function validateMarksData(marksBySubject, selectedCourse) {
  if (!selectedCourse) {
    return { valid: false, message: 'Please select a course first' };
  }

  let hasMarks = false;
  Object.values(marksBySubject).forEach(subjectMarks => {
    Object.values(subjectMarks).forEach(mark => {
      if (mark && mark > 0) {
        hasMarks = true;
      }
    });
  });

  if (!hasMarks) {
    return { valid: false, message: 'Please enter at least one mark before saving' };
  }

  return { valid: true };
}

// --------------------------------------------------------------------------
// Natural Language Speech-to-Text Marks Parser
// --------------------------------------------------------------------------
function parseVoiceMarksCommand(transcript, studentsList) {
  if (!transcript || !studentsList || !studentsList.length) return null;

  const text = transcript.toLowerCase().trim();

  // Find matching student
  let matchedStudent = null;
  let highestScore = 0;

  for (const s of studentsList) {
    const prof = s?.profile || {};
    const u = s?.user || {};
    const first = (prof.firstName || u.firstName || '').toLowerCase().trim();
    const last = (prof.lastName || u.lastName || '').toLowerCase().trim();
    const full = `${first} ${last}`.trim();
    const roll = (prof.rollNo || prof.registerNumber || '').toLowerCase().trim();

    // Check roll match
    if (roll && (text.includes(`roll ${roll}`) || text.includes(`number ${roll}`) || text.includes(`no ${roll}`) || text.includes(roll))) {
      matchedStudent = s;
      break;
    }

    // Check full name match
    if (full && full.length > 2 && text.includes(full)) {
      matchedStudent = s;
      break;
    }

    // Check first name or last name match
    if (first && first.length > 2 && text.includes(first)) {
      if (!matchedStudent || first.length > highestScore) {
        matchedStudent = s;
        highestScore = first.length;
      }
    } else if (last && last.length > 2 && text.includes(last)) {
      if (!matchedStudent || last.length > highestScore) {
        matchedStudent = s;
        highestScore = last.length;
      }
    }
  }

  if (!matchedStudent) {
    return { error: 'Student not recognized in command. Please speak the student name or roll number.' };
  }

  const marks = {};

  // Semester Exam: "semester [exam] X", "sem X", "final X", "theory X"
  const semMatch = text.match(/(?:semester(?:\s+exam)?|sem|final|theory|exam)\s+(?:is\s+)?(?:marks?\s+)?(\d{1,2})/i);
  if (semMatch) {
    marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(semMatch[1], 10)));
  }

  // Assignment: "assignment X", "assign X", "internal X", "test X"
  const assignMatch = text.match(/(?:assignment|assign|internals?|test)\s+(?:is\s+)?(?:marks?\s+)?(\d{1,2})/i);
  if (assignMatch) {
    marks['Assignment'] = Math.min(20, Math.max(0, parseInt(assignMatch[1], 10)));
  }

  // Practical: "practical X", "prac X", "lab X", "viva X"
  const pracMatch = text.match(/(?:practical|prac|lab|viva)\s+(?:is\s+)?(?:marks?\s+)?(\d{1,2})/i);
  if (pracMatch) {
    marks['Practical'] = Math.min(20, Math.max(0, parseInt(pracMatch[1], 10)));
  }

  // Fallback: If no component keywords matched, but numbers are given: e.g. "Vinit Kumar 54 18 16"
  if (Object.keys(marks).length === 0) {
    const numbers = text.match(/\b\d{1,2}\b/g);
    if (numbers && numbers.length >= 1) {
      if (numbers.length >= 3) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(numbers[0], 10)));
        marks['Assignment'] = Math.min(20, Math.max(0, parseInt(numbers[1], 10)));
        marks['Practical'] = Math.min(20, Math.max(0, parseInt(numbers[2], 10)));
      } else if (numbers.length === 2) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(numbers[0], 10)));
        marks['Assignment'] = Math.min(20, Math.max(0, parseInt(numbers[1], 10)));
      } else if (numbers.length === 1) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(numbers[0], 10)));
      }
    }
  }

  if (Object.keys(marks).length === 0) {
    return {
      student: matchedStudent,
      error: `Identified student ${displayName(matchedStudent)}, but could not detect marks (e.g. "semester 54 assignment 18 practical 16")`
    };
  }

  return {
    student: matchedStudent,
    marks
  };
}

export default function FacultyMarksEntry() {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedExamType, setSelectedExamType] = useState('All Subjects');
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [existingMarks, setExistingMarks] = useState({});

  // 👉 Subject-wise marks state (independent per subject)
  const [marksBySubject, setMarksBySubject] = useState({
    'Semester Exam': {},
    'Assignment': {},
    'Practical': {}
  });

  // Voice AI States
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedbackMsg, setVoiceFeedbackMsg] = useState(null);
  const [voiceHistory, setVoiceHistory] = useState([]);
  const [highlightedStudentId, setHighlightedStudentId] = useState(null);
  const [voiceAudioFeedback, setVoiceAudioFeedback] = useState(true);
  const [testCommandInput, setTestCommandInput] = useState('');

  const recognitionRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  function speakConfirmation(text) {
    if (!voiceAudioFeedback) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('SpeechSynthesis error:', err);
      }
    }
  }

  function processVoiceCommand(transcriptText) {
    if (!transcriptText || !transcriptText.trim()) return;
    const result = parseVoiceMarksCommand(transcriptText, students);
    if (!result || result.error) {
      const msg = result?.error || "Could not parse command. Try: '[Student Name] semester 50 assignment 18 practical 16'";
      setVoiceFeedbackMsg({ type: 'warning', text: msg });
      speakConfirmation("Could not recognize marks.");
      return;
    }

    const { student, marks } = result;
    const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;
    const sName = displayName(student);

    setMarksBySubject(prev => {
      const next = { ...prev };
      Object.entries(marks).forEach(([examType, val]) => {
        next[examType] = {
          ...(next[examType] || {}),
          [studentId]: val
        };
      });
      return next;
    });

    setHighlightedStudentId(studentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedStudentId(null);
    }, 4500);

    const summaryStr = Object.entries(marks).map(([k, v]) => `${k}: ${v}`).join(', ');
    setVoiceFeedbackMsg({ type: 'success', text: `Success: ${sName} → ${summaryStr}` });

    setVoiceHistory(prev => [
      {
        id: Date.now() + Math.random(),
        studentName: sName,
        summary: summaryStr,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      },
      ...prev.slice(0, 7)
    ]);

    speakConfirmation(`Marks updated for ${sName}`);
  }

  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);

  // --------------------------------------------------------------------------
  // Automatically Fill Table Inputs & Submit/Save directly to Database
  // --------------------------------------------------------------------------
  async function applyAndSubmitMarks(cmdText) {
    if (!cmdText || !cmdText.trim()) return;
    const result = parseVoiceMarksCommand(cmdText, students);
    if (!result || result.error) {
      setVoiceFeedbackMsg({ type: 'warning', text: result?.error || 'Could not parse marks command.' });
      speakConfirmation("Could not recognize marks or student.");
      return;
    }

    const { student, marks } = result;
    const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;
    const sName = displayName(student);

    // 1. Immediately update local state
    const nextSubjectMarks = {
      'Semester Exam': { ...(marksBySubject['Semester Exam'] || {}), ...(marks['Semester Exam'] != null ? { [studentId]: marks['Semester Exam'] } : {}) },
      'Assignment': { ...(marksBySubject['Assignment'] || {}), ...(marks['Assignment'] != null ? { [studentId]: marks['Assignment'] } : {}) },
      'Practical': { ...(marksBySubject['Practical'] || {}), ...(marks['Practical'] != null ? { [studentId]: marks['Practical'] } : {}) }
    };
    setMarksBySubject(nextSubjectMarks);

    setHighlightedStudentId(studentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedStudentId(null);
    }, 4500);

    const summaryStr = Object.entries(marks).map(([k, v]) => `${k}: ${v}`).join(', ');
    setVoiceFeedbackMsg({ type: 'success', text: `✅ Automatically filled & saving to database for ${sName}: ${summaryStr}...` });
    speakConfirmation(`Filled and submitting marks for ${sName}`);

    setVoiceHistory(prev => [
      {
        id: Date.now() + Math.random(),
        studentName: sName,
        summary: summaryStr + ' (Auto-Submitted)',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      },
      ...prev.slice(0, 7)
    ]);

    // 2. Automatically submit to database!
    if (!selectedCourse) {
      setError('Please select a course first');
      return;
    }

    try {
      setSaving(true);
      const validStudents = students.filter(s => {
        const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
        return sid && typeof sid === 'string' && sid.length === 24 && /^[0-9a-fA-F]{24}$/.test(sid);
      });

      if (validStudents.length > 0) {
        const payload = {
          courseId: selectedCourse,
          marks: validStudents.map(s => {
            const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
            const sem = nextSubjectMarks['Semester Exam']?.[sid] || 0;
            const assign = nextSubjectMarks['Assignment']?.[sid] || 0;
            const prac = nextSubjectMarks['Practical']?.[sid] || 0;
            const total = sem + assign + prac;
            return {
              studentId: sid,
              semesterExam: sem,
              assignment: assign,
              practical: prac,
              total,
              grade: calculateGrade(total)
            };
          })
        };

        await api.facultyMarksSave(payload);
        setSuccess(`🚀 Successfully filled & submitted marks for ${sName} (${summaryStr}) to database!`);
        setVoiceFeedbackMsg({ type: 'success', text: `🚀 Successfully saved & submitted to database for ${sName}!` });
        await loadExistingMarks();
      }
    } catch (saveErr) {
      console.error('Auto-save error:', saveErr);
      setError('Marks filled in table, but failed to save: ' + (saveErr?.message || 'Server error'));
    } finally {
      setSaving(false);
    }
  }

  function listenAndAutoSubmit() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFeedbackMsg({ type: 'warning', text: 'Speech Recognition not supported in this browser. Please use Chrome/Edge.' });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      setIsSubmittingVoice(true);
      setVoiceFeedbackMsg({ type: 'success', text: '🎙️ Listening... Speak marks now (e.g. "Vinit Kumar 54 18 16")' });

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setVoiceTranscript(transcript);
          setTestCommandInput(transcript);
          applyAndSubmitMarks(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsSubmittingVoice(false);
        if (event.error === 'not-allowed') {
          setVoiceFeedbackMsg({ type: 'warning', text: 'Microphone permission blocked in browser URL bar.' });
        } else {
          setVoiceFeedbackMsg({ type: 'warning', text: `Voice recognition: ${event.error}` });
        }
      };

      recognition.onend = () => {
        setIsSubmittingVoice(false);
      };

      recognition.start();
    } catch (e) {
      setIsSubmittingVoice(false);
      console.warn(e);
    }
  }

  function startVoiceListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFeedbackMsg({
        type: 'warning',
        text: 'Speech recognition API not supported in this browser. Please use the quick command input below or Google Chrome / Edge.'
      });
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceFeedbackMsg(null);
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const activeText = finalTranscript || interimTranscript;
        if (activeText) {
          setVoiceTranscript(activeText);
        }

        if (finalTranscript && finalTranscript.trim()) {
          processVoiceCommand(finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
          setVoiceFeedbackMsg({ type: 'warning', text: 'Microphone access denied. Please grant permission in browser settings.' });
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  }

  function stopVoiceListening() {
    setIsListening(false);
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) { }
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // Mark distribution configuration
  const markDistribution = {
    'Semester Exam': { weight: 60, maxMarks: 60, color: '#007bff' },
    'Assignment': { weight: 20, maxMarks: 20, color: '#28a745' },
    'Practical': { weight: 20, maxMarks: 20, color: '#ffc107' }
  };

  // Available exam types for tabs
  const examTypes = ['All Subjects', 'Semester Exam', 'Assignment', 'Practical'];

  // Helper function for making requests (same as in api.js)
  async function request(url, options = {}) {
    const token = localStorage.getItem('token');
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      ...options
    };

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${url}`, config);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  // Clear all marks permanently from database
  async function clearAllMarks() {
    if (!selectedCourse) {
      setError('Please select a course first');
      return;
    }

    const confirmed = window.confirm(
      '⚠️ WARNING: This will permanently delete ALL marks (Semester Exam, Assignment, and Practical) for this course. This action cannot be undone!\n\nAre you sure you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');
      setSaving(true);

      console.log('Deleting all marks for course:', selectedCourse);

      // Get all students first
      const studentsData = await api.facultyCourseStudents(selectedCourse);
      const students = Array.isArray(studentsData?.items) ? studentsData.items : (studentsData?.students || []);

      let deletedCount = 0;
      let errorCount = 0;

      // Delete marks for each student using existing API
      for (const student of students) {
        const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;

        if (studentId && studentId !== `temp-0` && !studentId.startsWith('temp-')) {
          try {
            // Use the existing delete API for each student
            await request(`/faculty/marks/${encodeURIComponent(selectedCourse)}/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
            deletedCount++;
            console.log(`Deleted marks for student: ${studentId}`);
          } catch (err) {
            errorCount++;
            console.log(`Failed to delete marks for student ${studentId}:`, err);
          }
        }
      }

      console.log(`Delete all summary: ${deletedCount} deleted, ${errorCount} errors`);

      if (deletedCount > 0) {
        setSuccess(`Successfully deleted ${deletedCount} student marks from the database!${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
      } else {
        setError('No marks found to delete');
      }

      // Clear all local state
      setMarksBySubject({
        'Semester Exam': {},
        'Assignment': {},
        'Practical': {}
      });
      setExistingMarks({});
      setSelectedExamType('All Subjects');

      // Reload to show empty state
      await loadExistingMarks();

    } catch (err) {
      console.error('Delete all marks error:', err);
      setError('Failed to delete marks from database');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadStudents();
      loadExistingMarks();
    }
  }, [selectedCourse]);

  // Scroll detection effect
  useEffect(() => {
    const tableWrapper = document.querySelector('.table-wrapper');
    if (!tableWrapper) return;

    const handleScroll = () => {
      const maxScroll = tableWrapper.scrollWidth - tableWrapper.clientWidth;
      const isScrollable = maxScroll > 0;
      const isAtEnd = tableWrapper.scrollLeft >= maxScroll - 5;

      // Add/remove scrollable class
      if (isScrollable && !isAtEnd) {
        tableWrapper.classList.add('scrollable');
      } else {
        tableWrapper.classList.remove('scrollable');
      }
    };

    // Initial check
    handleScroll();

    // Add scroll listener
    tableWrapper.addEventListener('scroll', handleScroll);

    // Handle window resize
    const handleResize = () => {
      handleScroll();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      tableWrapper.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [students]);

  async function loadCourses() {
    try {
      const crs = await api.facultyCourses();
      console.log('Raw API response:', crs);

      const all = crs?.courses || crs?.items || [];
      console.log('Final courses array:', all);

      setCourses(all);
      if (all.length && !selectedCourse) {
        const firstId = getCourseId(all[0]);
        if (firstId) setSelectedCourse(firstId);
      }
    } catch (err) {
      console.error('Load courses error:', err);
      setError('Failed to load courses');
    }
  }

  async function loadStudents() {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const r = await api.facultyCourseStudents(selectedCourse);
      console.log('Raw student data from API:', r);
      const students = Array.isArray(r?.items) ? r.items : (r?.students || []);
      console.log('Processed students array:', students);
      setStudents(students);
    } catch (err) {
      console.error('Failed to load students:', err);
      setError('Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadExistingMarks() {
    if (!selectedCourse) return;
    try {
      const r = await api.facultyMarksGet(selectedCourse);
      console.log('Loaded existing marks:', r);
      const loadedMarks = r?.marks || {};
      setExistingMarks(loadedMarks);

      // hydrate subject-wise state
      const next = { 'Semester Exam': {}, 'Assignment': {}, 'Practical': {} };
      Object.entries(loadedMarks).forEach(([studentId, row]) => {
        if (row?.semesterExam != null) next['Semester Exam'][studentId] = row.semesterExam;
        if (row?.assignment != null) next['Assignment'][studentId] = row.assignment;
        if (row?.practical != null) next['Practical'][studentId] = row.practical;
      });
      setMarksBySubject(next);

    } catch (err) {
      console.error('Failed to load existing marks:', err);
      if (err?.status === 404) {
        console.log('No existing marks found for this course');
        setExistingMarks({});
        setMarksBySubject({
          'Semester Exam': {},
          'Assignment': {},
          'Practical': {}
        });
      } else if (err?.status === 403) {
        console.log('Not authorized to view marks for this course');
        setExistingMarks({});
        setMarksBySubject({
          'Semester Exam': {},
          'Assignment': {},
          'Practical': {}
        });
      } else {
        console.error('Unexpected error loading marks:', err);
        setExistingMarks({});
        setMarksBySubject({
          'Semester Exam': {},
          'Assignment': {},
          'Practical': {}
        });
      }
    }
  }

  function handleMarkChange(studentId, examType, value) {
    const max = markDistribution[examType].maxMarks;
    const num = Math.max(0, Math.min(max, Number(value) || 0));
    setMarksBySubject(prev => ({
      ...prev,
      [examType]: {
        ...prev[examType],
        [studentId]: num
      }
    }));
  }

  function getValue(studentId, examType) {
    return marksBySubject[examType]?.[studentId] ?? '';
  }

  function calculateTotal(studentId) {
    if (selectedExamType === 'All Subjects') {
      return (
        (marksBySubject['Semester Exam']?.[studentId] || 0) +
        (marksBySubject['Assignment']?.[studentId] || 0) +
        (marksBySubject['Practical']?.[studentId] || 0)
      );
    } else {
      // For specific subjects, show only that subject's marks
      return marksBySubject[selectedExamType]?.[studentId] || 0;
    }
  }

  function calculateGrade(total) {
    if (total >= 95) return 'O';      // Outstanding - 95-100
    if (total >= 90) return 'A+';     // A+ - 90-94
    if (total >= 80) return 'A';      // A - 80-89
    if (total >= 70) return 'B+';     // B+ - 70-79
    if (total >= 60) return 'B';      // B - 60-69
    if (total >= 50) return 'C';      // C - 50-59
    return 'F';                       // Fail - Below 50
  }

  async function saveMarks() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const validation = validateMarksData(marksBySubject, selectedCourse);
      if (!validation.valid) {
        setError(validation.message);
        return;
      }

      // Filter out invalid student IDs
      const validStudents = students.filter((student, idx) => {
        const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId || `temp-${idx}`;
        return studentId &&
          studentId !== `temp-0` &&
          !studentId.startsWith('temp-') &&
          typeof studentId === 'string' &&
          studentId.length === 24 &&
          /^[0-9a-fA-F]{24}$/.test(studentId);
      });

      if (validStudents.length === 0) {
        setError('No valid students found to save marks');
        return;
      }

      const payload = {
        courseId: selectedCourse,
        marks: validStudents.map(student => {
          const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;
          const total = (marksBySubject['Semester Exam']?.[studentId] || 0) +
            (marksBySubject['Assignment']?.[studentId] || 0) +
            (marksBySubject['Practical']?.[studentId] || 0);
          return {
            studentId,
            semesterExam: marksBySubject['Semester Exam']?.[studentId] || 0,
            assignment: marksBySubject['Assignment']?.[studentId] || 0,
            practical: marksBySubject['Practical']?.[studentId] || 0,
            total: total,
            grade: calculateGrade(total)
          };
        })
      };

      console.log('=== SAVE PAYLOAD DEBUG ===');
      console.log('Valid students:', validStudents.length);
      console.log('Payload:', payload);
      console.log('========================');

      const result = await api.facultyMarksSave(payload);
      console.log('Save result:', result);

      setSuccess(`Successfully saved ${validStudents.length} student marks!`);

      await loadExistingMarks();
      await loadStudents();

    } catch (err) {
      console.error('Save marks error:', err);

      if (err?.status === 500) {
        if (err?.failed && Array.isArray(err.failed)) {
          const failedDetails = err.failed.map(f =>
            `Student ${f.studentId}: ${f.error}`
          ).join(', ');
          setError(`Save failed: ${failedDetails}`);
        } else {
          setError('Server error occurred while saving marks.');
        }
      } else if (err?.status === 404) {
        setError('Course not found. Please select a valid course.');
      } else if (err?.status === 403) {
        if (err?.debug) {
          setError(`Unauthorized: Faculty ID mismatch. (Your ID: ${err.debug.facultyId})`);
        } else {
          setError('You are not authorized to save marks for this course.');
        }
      } else if (err?.status === 400) {
        setError('Invalid marks data. Please check your entries and try again.');
      } else {
        setError(err?.message || 'Failed to save marks');
      }
    } finally {
      setSaving(false);
    }
  }

  const courseName = useMemo(() => {
    const course = courses.find(c => getCourseId(c) === selectedCourse);
    return course?.name || 'Select Course';
  }, [courses, selectedCourse]);

  const selectedCourseData = useMemo(() => {
    const course = courses.find(c => getCourseId(c) === selectedCourse);
    return course || {};
  }, [courses, selectedCourse]);

  // Get subject-wise statistics
  const subjectStats = useMemo(() => {
    if (!selectedCourse || !students.length) return {};

    const stats = {};
    examTypes.filter(type => type !== 'All Subjects').forEach(examType => {
      let totalStudents = 0;
      let totalMarks = 0;
      let completedStudents = 0;

      students.forEach(student => {
        const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;

        // Count all valid students
        if (studentId && typeof studentId === 'string' && studentId.length === 24 && /^[0-9a-fA-F]{24}$/.test(studentId)) {
          totalStudents++;

          const studentMark = marksBySubject[examType]?.[studentId];
          if (studentMark !== undefined && studentMark > 0) {
            totalMarks += studentMark;
            completedStudents++;
          }
        }
      });

      stats[examType] = {
        totalStudents,
        completedStudents,
        averageMarks: totalStudents > 0 ? (totalMarks / totalStudents).toFixed(1) : 0,
        completionRate: totalStudents > 0 ? ((completedStudents / totalStudents) * 100).toFixed(1) : 0
      };
    });

    return stats;
  }, [students, marksBySubject, selectedCourse]);

  // Helper function to show columns based on selected exam type
  const show = (examType) => selectedExamType === 'All Subjects' || selectedExamType === examType;

  return (
    <div className="faculty">
      <div className="card wide">
        <div className="marks-header">
          <div>
            <h2>Subject-Wise Marks Entry</h2>
            {selectedCourse && (
              <p className="header-subject">Subject: {courseName}</p>
            )}
          </div>
          <div className="marks-actions">
            <button
              type="button"
              className={`btn btn-voice ${isVoiceOpen ? 'active' : ''}`}
              onClick={() => {
                if (!selectedCourse) {
                  setError('Please select a course first before opening voice assistant');
                  return;
                }
                setIsVoiceOpen(prev => !prev);
              }}
              title="Open AI Speech-to-Text Verbal Mark Entry Console"
            >
              <span>🎙️</span> {isVoiceOpen ? 'Close Voice AI' : 'AI Voice Mark Entry'}
            </button>
            <button
              className="btn btn-danger"
              onClick={clearAllMarks}
              disabled={!selectedCourse || saving}
            >
              {saving ? 'Deleting…' : '🗑️ Delete All Marks'}
            </button>
            <button
              className="btn btn-primary"
              onClick={saveMarks}
              disabled={saving || !selectedCourse}
            >
              {saving ? 'Saving…' : 'Save All Marks'}
            </button>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        {/* AI Voice Mark Entry Console Panel */}
        {isVoiceOpen && (
          <div className="voice-console-panel">
            <div className="voice-console-header">
              <div className="voice-console-title">
                <div className={`voice-pulse-indicator ${isListening ? 'active' : ''}`} />
                <h4>AI Voice-Assisted Mark Entry</h4>
                <span className="voice-badge">Continuous Speech AI</span>
              </div>
              <div className="voice-console-actions">
                <button
                  type="button"
                  className={`btn-voice-toggle ${isListening ? 'recording' : 'paused'}`}
                  onClick={isListening ? stopVoiceListening : startVoiceListening}
                >
                  {isListening ? '⏹️ Stop Listening' : '🎙️ Start Listening'}
                </button>
                <label className="voice-tts-toggle">
                  <input
                    type="checkbox"
                    checked={voiceAudioFeedback}
                    onChange={e => setVoiceAudioFeedback(e.target.checked)}
                  />
                  Audio Readback
                </label>
                <button
                  type="button"
                  className="voice-close-btn"
                  onClick={() => {
                    stopVoiceListening();
                    setIsVoiceOpen(false);
                  }}
                  title="Close Voice Console"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="voice-transcript-box">
              <span className="voice-transcript-label">Live Recognized Speech</span>
              <p className="voice-transcript-text">
                {voiceTranscript || (isListening ? 'Listening for command... (e.g. "Vinit Kumar, semester 55, assignment 18, practical 16")' : 'Click "Start Listening" or type a verbal command below.')}
              </p>
            </div>

            <div style={{ margin: '8px 0 14px 0', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>1-Click Auto-Submit Demos:</span>
              <button
                type="button"
                className="btn btn-voice"
                style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => {
                  const cmd = 'Vinit Kumar semester 54 assignment 18 practical 16';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                🚀 Auto-Fill & Submit: Vinit (54, 18, 16)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10b981', color: '#d1fae5', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const cmd = 'Vinit Kumar 50 15 18';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                ⚡ Vinit: 50, 15, 18 (Auto-Submit)
              </button>
            </div>

            {voiceFeedbackMsg && (
              <div
                className="voice-status-pill"
                style={{
                  borderColor: voiceFeedbackMsg.type === 'warning' ? '#f59e0b' : '#10b981',
                  color: voiceFeedbackMsg.type === 'warning' ? '#fde68a' : '#34d399',
                  background: voiceFeedbackMsg.type === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'
                }}
              >
                {voiceFeedbackMsg.type === 'warning' ? '⚠️' : '✅'} {voiceFeedbackMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: '280px' }}>
                <input
                  type="text"
                  className="fd-input"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '8px',
                    padding: '8px 45px 8px 12px'
                  }}
                  placeholder="Type or click 🎙️: e.g. 'Vinit Kumar semester 54 assignment 18 practical 16'"
                  value={testCommandInput}
                  onChange={e => setTestCommandInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && testCommandInput.trim()) {
                      applyAndSubmitMarks(testCommandInput);
                      setVoiceTranscript(testCommandInput);
                      setTestCommandInput('');
                    }
                  }}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: isSubmittingVoice ? '#ef4444' : 'rgba(99, 102, 241, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                  onClick={listenAndAutoSubmit}
                  title="Click to speak voice command & auto-submit"
                >
                  🎙️
                </button>
              </div>

              <button
                type="button"
                className="btn btn-voice"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={listenAndAutoSubmit}
              >
                🎙️ {isSubmittingVoice ? 'Listening...' : 'Speak & Auto-Submit'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => {
                  const cmd = testCommandInput.trim() || 'Vinit Kumar semester 54 assignment 18 practical 16';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                  setTestCommandInput('');
                }}
              >
                ⚡ Fill & Submit Marks
              </button>
            </div>

            <div className="voice-helper-hints">
              <div><strong>Supported verbal formats:</strong></div>
              <div>• <em>"[Student Name], semester exam 55, assignment 18, practical 16"</em></div>
              <div>• <em>"Roll [RollNo], internal 19, practical 17"</em></div>
              <div>• <em>"[Student Name] 54 18 16"</em> (auto-maps to Semester, Assignment, Practical)</div>
            </div>

            {voiceHistory.length > 0 && (
              <div className="voice-recent-stream">
                <span className="voice-stream-title">Recent Voice Updates</span>
                <div className="voice-stream-chips">
                  {voiceHistory.map(item => (
                    <div key={item.id} className="voice-stream-chip">
                      <span className="chip-name">{item.studentName}</span>
                      <span className="chip-marks">{item.summary}</span>
                      <span className="chip-time">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            <label className="fd-label">Subject Filter</label>
            <div className="subject-tabs">
              {examTypes.map(examType => (
                <button
                  key={examType}
                  className={`subject-tab ${selectedExamType === examType ? 'active' : ''}`}
                  onClick={() => setSelectedExamType(examType)}
                  style={selectedExamType === examType ? {
                    backgroundColor: markDistribution[examType]?.color || '#007bff'
                  } : {}}
                >
                  {examType}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group full-width">
            <label className="fd-label">Subject Progress Dashboard</label>
            <div className="subject-stats">
              {Object.entries(subjectStats).map(([examType, stats]) => (
                <div key={examType} className="stat-item" style={{
                  borderLeft: `4px solid ${markDistribution[examType]?.color || '#007bff'}`
                }}>
                  <div className="stat-header">
                    <span className="stat-label">{examType}</span>
                    <span className="stat-badge" style={{
                      backgroundColor: markDistribution[examType]?.color || '#007bff'
                    }}>
                      {stats.completionRate}%
                    </span>
                  </div>
                  <div className="stat-details">
                    <div className="stat-row">
                      <span className="stat-label-small">Completed:</span>
                      <span className="stat-number">{stats.completedStudents}/{stats.totalStudents}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label-small">Average:</span>
                      <span className="stat-number">{stats.averageMarks}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="control-group full-width">
            <label className="fd-label">Mark Distribution</label>
            <div className="distribution-info">
              {Object.entries(markDistribution).map(([type, config]) => (
                <span key={type} className="dist-item" style={{
                  borderColor: config.color
                }}>
                  {type}: {config.weight}% (Max: {config.maxMarks})
                </span>
              ))}
            </div>
          </div>
        </div>

        {selectedCourse && (
          <div className="marks-section">
            <div className="section-header">
              <h3>
                {selectedExamType === 'All Subjects' ? 'All Subjects' : selectedExamType} - {courseName}
              </h3>
              <div className="student-count">
                Showing {students.length} students
              </div>
            </div>

            {/* Debug Information */}
            {selectedExamType && selectedExamType !== 'All Subjects' && (
              <div className="debug-info" style={{
                background: '#f0f0f0',
                padding: '10px',
                margin: '10px 0',
                borderRadius: '5px',
                fontSize: '12px'
              }}>
                <strong>Subject View:</strong><br />
                Selected Subject: {selectedExamType}<br />
                Total Students: {students.length}<br />
                Showing: All students with {selectedExamType.toLowerCase()} column only
              </div>
            )}

            {loading ? (
              <div className="loading">Loading students...</div>
            ) : students.length === 0 ? (
              <div className="empty-hint">
                No students found in this course
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="marks-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Reg/Roll No</th>
                      {show('Semester Exam') && <th>Semester Exam<br />(60)</th>}
                      {show('Assignment') && <th>Assignment<br />(20)</th>}
                      {show('Practical') && <th>Practical<br />(20)</th>}
                      <th>Total<br />({selectedExamType === 'All Subjects' ? '100' : markDistribution[selectedExamType]?.maxMarks || '100'})</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, idx) => {
                      const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId || `temp-${idx}`;
                      const total = calculateTotal(studentId);
                      const grade = calculateGrade(total);
                      const prof = student?.profile || {};
                      const regNo = prof.registerNumber || prof.rollNo || '-';

                      return (
                        <tr
                          key={studentId}
                          className={highlightedStudentId === studentId ? 'voice-matched-row' : ''}
                        >
                          <td className="student-name">{displayName(student)}</td>
                          <td className="reg-no">{regNo}</td>
                          {show('Semester Exam') && (
                            <td>
                              <input
                                type="number"
                                className="mark-input"
                                min="0"
                                max="60"
                                value={getValue(studentId, 'Semester Exam')}
                                onChange={(e) => handleMarkChange(studentId, 'Semester Exam', e.target.value)}
                                placeholder="0-60"
                              />
                            </td>
                          )}
                          {show('Assignment') && (
                            <td>
                              <input
                                type="number"
                                className="mark-input"
                                min="0"
                                max="20"
                                value={getValue(studentId, 'Assignment')}
                                onChange={(e) => handleMarkChange(studentId, 'Assignment', e.target.value)}
                                placeholder="0-20"
                              />
                            </td>
                          )}
                          {show('Practical') && (
                            <td>
                              <input
                                type="number"
                                className="mark-input"
                                min="0"
                                max="20"
                                value={getValue(studentId, 'Practical')}
                                onChange={(e) => handleMarkChange(studentId, 'Practical', e.target.value)}
                                placeholder="0-20"
                              />
                            </td>
                          )}
                          <td className="total-marks">
                            <strong>{total}</strong>
                          </td>
                          <td className={`grade ${getGradeClassName(grade)}`}>
                            <strong>{grade}</strong>
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
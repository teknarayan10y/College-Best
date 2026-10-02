import React, { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../../auth/api';
import './FacultyMarksEntry.css';

function getCourseId(c) {
  return (c && (c._id || c.id || c.courseId || (c.course && c.course._id))) || '';
}

function displayName(p) {
  const u = p?.user || {};
  const prof = p?.profile || {};
  const directName = p?.name || u?.name || '';
  const first = prof.firstName || u.firstName || '';
  const last = prof.lastName || u.lastName || '';
  const fullName = `${first} ${last}`.trim();
  const idLike = prof.registerNumber || prof.rollNo || p?.rollNo || '';
  return fullName || directName || idLike || u.email || 'Student';
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
// --------------------------------------------------------------------------
// Helper: Convert Spoken English Number Words to Digits (e.g. "fifty" -> 50)
// --------------------------------------------------------------------------
function convertWordsToNumbers(text) {
  if (!text) return '';
  const wordMap = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
    'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
    'eighty': 80, 'ninety': 90, 'hundred': 100
  };

  let res = text.toLowerCase();

  // Handle compound tens + units: e.g. "fifty four" -> "54", "forty five" -> "45"
  const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const units = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

  for (const t of tens) {
    for (const u of units) {
      const reg = new RegExp(`\\b${t}\\s+${u}\\b`, 'gi');
      res = res.replace(reg, String(wordMap[t] + wordMap[u]));
    }
  }

  // Handle single words: "fifty" -> "50"
  Object.keys(wordMap).forEach(w => {
    const reg = new RegExp(`\\b${w}\\b`, 'gi');
    res = res.replace(reg, String(wordMap[w]));
  });

  return res;
}

// --------------------------------------------------------------------------
// Helper: Clean & Normalize Alphanumeric Roll Numbers (e.g. "23IT01", "23 it 01" -> "23it01")
// --------------------------------------------------------------------------
function normalizeRollNo(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[\s\-_#]/g, '');
}

// Helper: Build flexible regex for roll numbers like 23IT01 (matches "23it01", "23 it 01", "23 it 1")
function buildRollRegex(roll) {
  if (!roll) return null;
  const clean = normalizeRollNo(roll);
  // Match groups of digits and letters: e.g. "23", "it", "01"
  const tokens = clean.match(/([0-9]+|[a-zA-Z]+)/g);
  if (!tokens || tokens.length === 0) return null;

  const patternParts = tokens.map((tok, idx) => {
    // For trailing numbers, allow optional leading zeros (e.g. "01" vs "1")
    if (idx === tokens.length - 1 && /^[0-9]+$/.test(tok)) {
      const stripped = tok.replace(/^0+/, '');
      return stripped ? `0*${stripped}` : tok;
    }
    return tok;
  });

  const pat = patternParts.join('\\s*');
  return new RegExp(`(?:roll\\s*(?:no|number)?|number|no|reg|registration|student)?\\s*#?\\s*\\b(${pat})\\b`, 'i');
}

// --------------------------------------------------------------------------
// Natural Language Speech-to-Text Marks Parser
// Supports: "23IT01 mark 50", "roll 23 it 01 mark 50", "mask 50", "vinit mask 50", etc.
// --------------------------------------------------------------------------
function parseVoiceMarksCommand(transcript, studentsList, currentSubject = 'All Subjects', activeStudentId = null, activeExamType = 'Semester Exam') {
  if (!transcript || !studentsList || !studentsList.length) return null;

  let text = transcript.toLowerCase().trim();

  // 1. Convert word-numbers ("fifty" -> "50", "forty five" -> "45")
  text = convertWordsToNumbers(text);

  // 2. Normalize common verbal phrases: "tell him to mask", "tell to mask", "ask him to mask", etc.
  text = text.replace(/\b(?:tell|ask)\s+(?:him|her|them)?\s*(?:to)?\s*(?:put|give|set|enter|show)?\s*(?:mask|mark|marks)\b/gi, 'mark');
  text = text.replace(/\b(?:tell|ask)\s+(?:him|her|them)?\s*(?:to)?\b/gi, '');
  text = text.replace(/\b(?:give|put|set|enter|show)\s+(?:mask|mark|marks)\b/gi, 'mark');

  // 3. Normalize speech variations: "mask", "maske", "marx", "max", "marc", "mork", "marka" -> "mark"
  text = text.replace(/\b(?:mask|maske|marx|max|marc|mork|marka)\b/gi, 'mark');

  // Find matching student
  let matchedStudent = null;
  let highestScore = 0;

  for (let i = 0; i < studentsList.length; i++) {
    const s = studentsList[i];
    const prof = s?.profile || {};
    const u = s?.user || {};
    const directName = (s?.name || u?.name || '').toLowerCase().trim();
    const first = (prof.firstName || u.firstName || directName.split(' ')[0] || '').toLowerCase().trim();
    const last = (prof.lastName || u.lastName || (directName.split(' ').length > 1 ? directName.split(' ').slice(1).join(' ') : '')).toLowerCase().trim();
    const full = (prof.firstName || prof.lastName) ? `${first} ${last}`.trim() : directName;
    const roll = (prof.rollNo || prof.registerNumber || s?.rollNo || s?.registerNumber || u?.rollNo || u?.registerNumber || '').toLowerCase().trim();

    // Check exact & flexible alphanumeric roll match: e.g. "23IT01", "23 it 01", "roll 23 it 01"
    if (roll) {
      const rollRegex = buildRollRegex(roll);
      if (rollRegex && rollRegex.test(text)) {
        matchedStudent = s;
        break;
      }
      // Also check normalized continuous string
      const cleanT = normalizeRollNo(text);
      const cleanR = normalizeRollNo(roll);
      if (cleanR && cleanT.includes(cleanR)) {
        matchedStudent = s;
        break;
      }
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

  // Ordinal / index match: "student 1", "row 1", "first student", etc.
  if (!matchedStudent) {
    if (text.includes('first student') || text.includes('student 1') || text.includes('row 1')) {
      matchedStudent = studentsList[0];
    } else if (text.includes('second student') || text.includes('student 2') || text.includes('row 2')) {
      matchedStudent = studentsList[1] || studentsList[0];
    } else if (text.includes('third student') || text.includes('student 3') || text.includes('row 3')) {
      matchedStudent = studentsList[2] || studentsList[0];
    }
  }

  // Contextual fallback: If student wasn't named in speech, use the currently active/selected student row
  if (!matchedStudent && activeStudentId) {
    matchedStudent = studentsList.find(s => {
      const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
      return sid === activeStudentId;
    });
  }

  // Default to first student in list if still not determined
  if (!matchedStudent && studentsList.length > 0) {
    matchedStudent = studentsList[0];
  }

  if (!matchedStudent) {
    return { error: 'No student selected or recognized. Please select a student or say student name.' };
  }

  const marks = {};
  let targetExamType = activeExamType || 'Semester Exam';

  // Semester Exam: "semester [exam] X", "sem X", "final X", "theory X"
  const semMatch = text.match(/(?:semester(?:\s+exam)?|sem|final|theory|exam)\s+(?:is\s+)?(?:mark|marks)?\s*(\d{1,2})/i);
  if (semMatch) {
    marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(semMatch[1], 10)));
    targetExamType = 'Semester Exam';
  }

  // Assignment: "assignment X", "assign X", "internal X", "test X"
  const assignMatch = text.match(/(?:assignment|assign|internals?|test)\s+(?:is\s+)?(?:mark|marks)?\s*(\d{1,2})/i);
  if (assignMatch) {
    marks['Assignment'] = Math.min(20, Math.max(0, parseInt(assignMatch[1], 10)));
    targetExamType = 'Assignment';
  }

  // Practical: "practical X", "prac X", "lab X", "viva X"
  const pracMatch = text.match(/(?:practical|prac|lab|viva)\s+(?:is\s+)?(?:mark|marks)?\s*(\d{1,2})/i);
  if (pracMatch) {
    marks['Practical'] = Math.min(20, Math.max(0, parseInt(pracMatch[1], 10)));
    targetExamType = 'Practical';
  }

  // Direct "mark X" / "mask X" / "score X" match (e.g. "mark 50", "mask 50", "Vinit mask 45")
  const directMarkMatch = text.match(/(?:mark|marks|score|put|give|grade)\s+(?:is\s+)?(\d{1,2})/i);
  if (directMarkMatch && Object.keys(marks).length === 0) {
    const val = parseInt(directMarkMatch[1], 10);
    // Route to appropriate column
    if (currentSubject === 'Assignment' || targetExamType === 'Assignment') {
      marks['Assignment'] = Math.min(20, Math.max(0, val));
      targetExamType = 'Assignment';
    } else if (currentSubject === 'Practical' || targetExamType === 'Practical') {
      marks['Practical'] = Math.min(20, Math.max(0, val));
      targetExamType = 'Practical';
    } else {
      if (val > 20) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, val));
        targetExamType = 'Semester Exam';
      } else if (targetExamType && targetExamType !== 'All Subjects') {
        marks[targetExamType] = Math.min(targetExamType === 'Semester Exam' ? 60 : 20, Math.max(0, val));
      } else {
        marks['Semester Exam'] = Math.min(60, Math.max(0, val));
        targetExamType = 'Semester Exam';
      }
    }
  }

  // Fallback: If no keywords matched, but numbers are given (e.g. "Vinit Kumar 54 18 16" or "50")
  if (Object.keys(marks).length === 0) {
    const prof = matchedStudent?.profile || {};
    const u = matchedStudent?.user || {};
    const roll = (prof.rollNo || prof.registerNumber || matchedStudent?.rollNo || matchedStudent?.registerNumber || u?.rollNo || u?.registerNumber || '').trim();
    let cleanText = text;

    // Strip alphanumeric roll patterns (e.g. "23 it 01", "23it01") so "23" and "01" are NOT mistaken for marks!
    if (roll) {
      const rollRegex = buildRollRegex(roll);
      if (rollRegex) {
        cleanText = cleanText.replace(rollRegex, ' ');
      }
      const rawClean = normalizeRollNo(roll);
      if (/^\d+$/.test(rawClean)) {
        cleanText = cleanText.replace(new RegExp(`\\b${rawClean}\\b`, 'gi'), ' ');
      }
    }
    const numbers = cleanText.match(/\b\d{1,2}\b/g);
    if (numbers && numbers.length >= 1) {
      if (numbers.length >= 3) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(numbers[0], 10)));
        marks['Assignment'] = Math.min(20, Math.max(0, parseInt(numbers[1], 10)));
        marks['Practical'] = Math.min(20, Math.max(0, parseInt(numbers[2], 10)));
        targetExamType = 'Semester Exam';
      } else if (numbers.length === 2) {
        marks['Semester Exam'] = Math.min(60, Math.max(0, parseInt(numbers[0], 10)));
        marks['Assignment'] = Math.min(20, Math.max(0, parseInt(numbers[1], 10)));
        targetExamType = 'Semester Exam';
      } else if (numbers.length === 1) {
        const val = parseInt(numbers[0], 10);
        if (currentSubject === 'Assignment' || targetExamType === 'Assignment') {
          marks['Assignment'] = Math.min(20, Math.max(0, val));
          targetExamType = 'Assignment';
        } else if (currentSubject === 'Practical' || targetExamType === 'Practical') {
          marks['Practical'] = Math.min(20, Math.max(0, val));
          targetExamType = 'Practical';
        } else {
          marks['Semester Exam'] = Math.min(60, Math.max(0, val));
          targetExamType = 'Semester Exam';
        }
      }
    }
  }

  if (Object.keys(marks).length === 0) {
    return {
      student: matchedStudent,
      error: `Identified student ${displayName(matchedStudent)}, but could not detect mark (e.g. say "mask 50" or "mark 45")`
    };
  }

  return {
    student: matchedStudent,
    marks,
    targetExamType
  };
}

export default function FacultyMarksEntry() {
  const [selectedCourse, setSelectedCourse] = useState(() => {
    try {
      return localStorage.getItem('faculty_selected_course') || '';
    } catch {
      return '';
    }
  });
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
  const [highlightedExamType, setHighlightedExamType] = useState(null);
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [activeExamType, setActiveExamType] = useState('Semester Exam');
  const [voiceAudioFeedback, setVoiceAudioFeedback] = useState(true);
  const [testCommandInput, setTestCommandInput] = useState('');

  const recognitionRef = useRef(null);
  const singleRecognitionRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const isListeningRef = useRef(false);
  const isIntentionalAbortRef = useRef(false);

  function stopAllSpeechRecognition() {
    isIntentionalAbortRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) { }
      recognitionRef.current = null;
    }
    if (singleRecognitionRef.current) {
      try {
        singleRecognitionRef.current.abort();
      } catch (e) { }
      singleRecognitionRef.current = null;
    }
    setIsListening(false);
    setIsSubmittingVoice(false);
    isListeningRef.current = false;
    setVoiceFeedbackMsg(null);
    setTimeout(() => {
      isIntentionalAbortRef.current = false;
    }, 150);
  }

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Quick Roll Number Mark Entry States
  const [quickRollNo, setQuickRollNo] = useState('');
  const [quickMark, setQuickMark] = useState('');
  const [quickExamType, setQuickExamType] = useState('Semester Exam');
  const quickRollInputRef = useRef(null);

  // Keep first student active by default so verbal commands like "mask 50" work immediately
  useEffect(() => {
    if (students.length > 0 && !activeStudentId) {
      const firstId = students[0]?._id || students[0]?.userId || students[0]?.user?._id || students[0]?.user?.id || students[0]?.studentId;
      if (firstId) setActiveStudentId(firstId);
    }
  }, [students, activeStudentId]);

  async function handleQuickRollSubmit(e) {
    if (e) e.preventDefault();
    if (!quickRollNo || quickRollNo.trim() === '') {
      setError('Please enter a student roll number');
      return;
    }
    if (quickMark === '' || isNaN(quickMark)) {
      setError('Please enter a valid mark');
      return;
    }

    const termClean = normalizeRollNo(quickRollNo);
    // Locate student by alphanumeric roll number, register number, or student ID
    const targetStudent = students.find(s => {
      const prof = s?.profile || {};
      const u = s?.user || {};
      const r1 = normalizeRollNo(prof.rollNo);
      const r2 = normalizeRollNo(prof.registerNumber);
      const r3 = normalizeRollNo(s?.rollNo);
      const r4 = normalizeRollNo(s?.registerNumber);
      const r5 = normalizeRollNo(u?.rollNo);
      const r6 = normalizeRollNo(u?.registerNumber);
      return (
        (r1 && r1 === termClean) ||
        (r2 && r2 === termClean) ||
        (r3 && r3 === termClean) ||
        (r4 && r4 === termClean) ||
        (r5 && r5 === termClean) ||
        (r6 && r6 === termClean)
      );
    });

    if (!targetStudent) {
      setError(`No student found with Roll/Reg No: "${quickRollNo}". Please check the number.`);
      speakConfirmation("Student roll number not found.");
      return;
    }

    const maxM = markDistribution[quickExamType]?.maxMarks || 60;
    const num = Math.min(maxM, Math.max(0, Number(quickMark)));
    const studentId = targetStudent?._id || targetStudent?.userId || targetStudent?.user?._id || targetStudent?.user?.id || targetStudent?.studentId;
    const sName = displayName(targetStudent);

    // 1. Update marks state immediately
    const nextSubjectMarks = {
      ...marksBySubject,
      [quickExamType]: {
        ...(marksBySubject[quickExamType] || {}),
        [studentId]: num
      }
    };
    setMarksBySubject(nextSubjectMarks);

    // 2. Highlight student row and column
    setHighlightedStudentId(studentId);
    setHighlightedExamType(quickExamType);
    setActiveStudentId(studentId);
    setActiveExamType(quickExamType);

    setTimeout(() => {
      const row = document.getElementById(`student-row-${studentId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const inp = document.getElementById(`mark-input-${studentId}-${quickExamType.replace(/\s+/g, '-')}`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 60);

    setSuccess(`✅ Roll ${quickRollNo} (${sName}): ${quickExamType} = ${num} saved!`);
    speakConfirmation(`Mark ${num} entered for Roll ${quickRollNo}`);

    // Auto-save to database
    try {
      const validStudents = students.filter(s => {
        const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
        return sid && typeof sid === 'string' && sid.length === 24 && /^[0-9a-fA-F]{24}$/.test(sid);
      });

      if (validStudents.length > 0 && selectedCourse) {
        const payload = {
          courseId: selectedCourse,
          marks: validStudents.map(s => {
            const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
            const sem = sid === studentId && quickExamType === 'Semester Exam' ? num : (nextSubjectMarks['Semester Exam']?.[sid] || 0);
            const assign = sid === studentId && quickExamType === 'Assignment' ? num : (nextSubjectMarks['Assignment']?.[sid] || 0);
            const prac = sid === studentId && quickExamType === 'Practical' ? num : (nextSubjectMarks['Practical']?.[sid] || 0);
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
      }
    } catch (saveErr) {
      console.warn('Auto save error:', saveErr);
    }

    // Reset inputs and focus back for the next student paper
    setQuickRollNo('');
    setQuickMark('');
    if (quickRollInputRef.current) {
      quickRollInputRef.current.focus();
    }
  }

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
    const result = parseVoiceMarksCommand(transcriptText, students, selectedExamType, activeStudentId, activeExamType);
    if (!result || result.error) {
      const msg = result?.error || "Could not parse command. Try: 'mask 50', 'vinit mask 50', or 'roll 101 mask 45'";
      setVoiceFeedbackMsg({ type: 'warning', text: msg });
      speakConfirmation("Could not recognize marks.");
      return;
    }

    const { student, marks, targetExamType } = result;
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
    if (targetExamType) setHighlightedExamType(targetExamType);
    setActiveStudentId(studentId);

    setTimeout(() => {
      const row = document.getElementById(`student-row-${studentId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (targetExamType) {
        const inp = document.getElementById(`mark-input-${studentId}-${targetExamType.replace(/\s+/g, '-')}`);
        if (inp) {
          inp.focus();
          inp.select();
        }
      }
    }, 60);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedStudentId(null);
      setHighlightedExamType(null);
    }, 5000);

    const summaryStr = Object.entries(marks).map(([k, v]) => `${k}: ${v}`).join(', ');
    setVoiceFeedbackMsg({ type: 'success', text: `🎯 Column Updated for ${sName}: ${summaryStr}` });

    setVoiceHistory(prev => [
      {
        id: Date.now() + Math.random(),
        studentName: sName,
        summary: summaryStr,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      },
      ...prev.slice(0, 7)
    ]);

    speakConfirmation(`Mark entered for ${sName}`);
  }

  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);

  // --------------------------------------------------------------------------
  // Automatically Fill Table Inputs & Submit/Save directly to Database
  // --------------------------------------------------------------------------
  async function applyAndSubmitMarks(cmdText) {
    if (!cmdText || !cmdText.trim()) return;
    const result = parseVoiceMarksCommand(cmdText, students, selectedExamType, activeStudentId, activeExamType);
    if (!result || result.error) {
      setVoiceFeedbackMsg({ type: 'warning', text: result?.error || 'Could not parse marks command.' });
      speakConfirmation("Could not recognize mark or student.");
      return;
    }

    const { student, marks, targetExamType } = result;
    const studentId = student?._id || student?.userId || student?.user?._id || student?.user?.id || student?.studentId;
    const sName = displayName(student);

    // 1. Immediately update local state so the input in column shows up right away!
    const nextSubjectMarks = {
      'Semester Exam': { ...(marksBySubject['Semester Exam'] || {}), ...(marks['Semester Exam'] != null ? { [studentId]: marks['Semester Exam'] } : {}) },
      'Assignment': { ...(marksBySubject['Assignment'] || {}), ...(marks['Assignment'] != null ? { [studentId]: marks['Assignment'] } : {}) },
      'Practical': { ...(marksBySubject['Practical'] || {}), ...(marks['Practical'] != null ? { [studentId]: marks['Practical'] } : {}) }
    };
    setMarksBySubject(nextSubjectMarks);

    setHighlightedStudentId(studentId);
    if (targetExamType) setHighlightedExamType(targetExamType);
    setActiveStudentId(studentId);

    setTimeout(() => {
      const row = document.getElementById(`student-row-${studentId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (targetExamType) {
        const inp = document.getElementById(`mark-input-${studentId}-${targetExamType.replace(/\s+/g, '-')}`);
        if (inp) {
          inp.focus();
          inp.select();
        }
      }
    }, 60);

    const summaryStr = Object.entries(marks).map(([k, v]) => `${k}: ${v}`).join(', ');
    setVoiceFeedbackMsg({ type: 'success', text: `✅ Automatically filled & saving to database for ${sName}: ${summaryStr}...` });
    speakConfirmation(`Mark entered and submitting for ${sName}`);

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
    if (isSubmittingVoice) {
      stopAllSpeechRecognition();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFeedbackMsg({ type: 'warning', text: 'Speech Recognition not supported in this browser. Please use Chrome/Edge.' });
      return;
    }

    // Safely stop any previous speech session first
    stopAllSpeechRecognition();

    setTimeout(() => {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = navigator.language || 'en-IN';

        singleRecognitionRef.current = recognition;
        setIsSubmittingVoice(true);
        setVoiceFeedbackMsg({ type: 'success', text: '🎙️ Listening NOW... Speak student roll/name and marks (e.g. "Roll 101 mark 50")' });

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
          // Ignore benign abort errors from switching/restarting
          if (event.error === 'aborted' || isIntentionalAbortRef.current) {
            return;
          }
          if (event.error === 'not-allowed') {
            setVoiceFeedbackMsg({
              type: 'warning',
              text: '🔒 Microphone blocked. Click the lock/tune icon in your browser URL bar and set Microphone to "Allow".'
            });
          } else if (event.error === 'no-speech') {
            setVoiceFeedbackMsg({
              type: 'warning',
              text: '🎙️ No speech detected. Please speak into your microphone after clicking, or check that mic is unmuted.'
            });
          } else if (event.error === 'network') {
            setVoiceFeedbackMsg({
              type: 'warning',
              text: '🌐 Speech recognition network error. Please check your internet connection or use fast roll number entry.'
            });
          } else if (event.error === 'audio-capture') {
            setVoiceFeedbackMsg({
              type: 'warning',
              text: '🎙️ No microphone detected. Please plug in or enable your microphone.'
            });
          } else {
            setVoiceFeedbackMsg({ type: 'warning', text: `Voice status: ${event.error}` });
          }
        };

        recognition.onend = () => {
          setIsSubmittingVoice(false);
          singleRecognitionRef.current = null;
        };

        recognition.start();
      } catch (e) {
        setIsSubmittingVoice(false);
        console.warn('Speech start error:', e);
      }
    }, 60);
  }

  function startVoiceListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFeedbackMsg({
        type: 'warning',
        text: 'Speech recognition API not supported in this browser. Please use Google Chrome or Edge.'
      });
      return;
    }

    // Safely stop any previous speech session first
    stopAllSpeechRecognition();

    setTimeout(() => {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-IN';

        recognition.onstart = () => {
          setIsListening(true);
          isListeningRef.current = true;
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
          // Ignore benign abort errors when stopping/restarting
          if (event.error === 'aborted' || isIntentionalAbortRef.current) {
            return;
          }
          if (event.error === 'not-allowed') {
            setIsListening(false);
            isListeningRef.current = false;
            setVoiceFeedbackMsg({ type: 'warning', text: '🔒 Microphone access denied. Please click the URL bar lock icon and allow microphone access.' });
          } else if (event.error === 'no-speech') {
            // In continuous mode, no-speech is normal when user is pausing
          } else if (event.error === 'network') {
            setVoiceFeedbackMsg({ type: 'warning', text: '🌐 Speech service network error. Check internet connection.' });
          } else if (event.error === 'audio-capture') {
            setIsListening(false);
            isListeningRef.current = false;
            setVoiceFeedbackMsg({ type: 'warning', text: '🎙️ No microphone detected. Please plug in or enable your microphone.' });
          } else {
            setVoiceFeedbackMsg({ type: 'warning', text: `Voice status: ${event.error}` });
          }
        };

        recognition.onend = () => {
          if (isListeningRef.current && !isIntentionalAbortRef.current) {
            try {
              recognition.start();
            } catch {
              setIsListening(false);
              isListeningRef.current = false;
            }
          } else {
            setIsListening(false);
            isListeningRef.current = false;
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        isListeningRef.current = true;
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        setIsListening(false);
        isListeningRef.current = false;
      }
    }, 60);
  }

  function stopVoiceListening() {
    stopAllSpeechRecognition();
  }

  useEffect(() => {
    return () => {
      stopAllSpeechRecognition();
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
      try {
        localStorage.setItem('faculty_selected_course', selectedCourse);
      } catch { }
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
      if (all.length) {
        let courseToSelect = '';
        try {
          const saved = localStorage.getItem('faculty_selected_course');
          if (saved && all.find(c => getCourseId(c) === saved)) {
            courseToSelect = saved;
          }
        } catch { }

        if (!courseToSelect && !selectedCourse) {
          courseToSelect = getCourseId(all[0]);
        }

        if (courseToSelect && courseToSelect !== selectedCourse) {
          setSelectedCourse(courseToSelect);
        }
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
      loadExistingMarks();
    } catch (err) {
      console.error('Failed to load students:', err);
      setError('Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  function getStudentUserId(student, idx = 0) {
    if (!student) return `temp-${idx}`;
    const uid = student?.user?._id || student?.user?.id || (typeof student?.profile?.user === 'string' ? student?.profile?.user : student?.profile?.user?._id);
    if (uid) return String(uid);
    return String(student?._id || student?.userId || student?.studentId || student?.id || `temp-${idx}`);
  }

  async function loadExistingMarks() {
    if (!selectedCourse) return;
    try {
      const r = await api.facultyMarksGet(selectedCourse);
      console.log('Loaded existing marks:', r);
      const loadedMarks = r?.marks || {};
      setExistingMarks(loadedMarks);

      // hydrate subject-wise state (support both space-separated and camelCase keys)
      const next = { 'Semester Exam': {}, 'Assignment': {}, 'Practical': {} };
      Object.entries(loadedMarks).forEach(([studentId, row]) => {
        const sem = row?.['Semester Exam'] ?? row?.semesterExam;
        const assign = row?.['Assignment'] ?? row?.assignment;
        const prac = row?.['Practical'] ?? row?.practical;

        const sIdStr = String(studentId);
        if (sem != null && sem !== '') next['Semester Exam'][sIdStr] = Number(sem);
        if (assign != null && assign !== '') next['Assignment'][sIdStr] = Number(assign);
        if (prac != null && prac !== '') next['Practical'][sIdStr] = Number(prac);

        // Also map to student's other ID aliases if present
        const matched = students.find(s =>
          String(s?.user?._id || s?.user?.id || s?._id || s?.userId || '') === sIdStr ||
          String(s?.profile?.user || '') === sIdStr
        );
        if (matched) {
          const allAliases = [matched?.user?._id, matched?.user?.id, matched?._id, matched?.userId].filter(Boolean).map(String);
          allAliases.forEach(alias => {
            if (sem != null && sem !== '') next['Semester Exam'][alias] = Number(sem);
            if (assign != null && assign !== '') next['Assignment'][alias] = Number(assign);
            if (prac != null && prac !== '') next['Practical'][alias] = Number(prac);
          });
        }
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

  function handleMarkChange(studentOrId, examType, value) {
    const max = markDistribution[examType].maxMarks;
    const num = value === '' ? '' : Math.max(0, Math.min(max, Number(value) || 0));
    const sid = typeof studentOrId === 'object' ? getStudentUserId(studentOrId) : String(studentOrId);
    const studentObj = typeof studentOrId === 'object' ? studentOrId : students.find(s => getStudentUserId(s) === sid || String(s?._id) === sid);
    const ids = studentObj ? [
      studentObj?.user?._id,
      studentObj?.user?.id,
      studentObj?._id,
      studentObj?.userId
    ].filter(Boolean).map(String) : [sid];

    setMarksBySubject(prev => {
      const nextMap = { ...(prev[examType] || {}) };
      ids.forEach(id => {
        nextMap[id] = num;
      });
      return {
        ...prev,
        [examType]: nextMap
      };
    });
  }

  function getValue(studentOrId, examType) {
    if (!studentOrId) return '';
    const sid = typeof studentOrId === 'object' ? getStudentUserId(studentOrId) : String(studentOrId);

    // 1. Direct match in marksBySubject
    if (marksBySubject[examType]?.[sid] !== undefined && marksBySubject[examType]?.[sid] !== '') {
      return marksBySubject[examType][sid];
    }

    // 2. Search aliases via student object
    const studentObj = typeof studentOrId === 'object'
      ? studentOrId
      : students.find(s =>
          String(s?.user?._id || s?.user?.id || s?._id || s?.userId || '') === sid ||
          String(s?.profile?.user || '') === sid
        );

    if (studentObj) {
      const possibleIds = [
        studentObj?.user?._id,
        studentObj?.user?.id,
        typeof studentObj?.profile?.user === 'string' ? studentObj?.profile?.user : studentObj?.profile?.user?._id,
        studentObj?._id,
        studentObj?.userId,
        studentObj?.studentId
      ].filter(Boolean).map(String);

      for (const id of possibleIds) {
        if (marksBySubject[examType]?.[id] !== undefined && marksBySubject[examType]?.[id] !== '') {
          return marksBySubject[examType][id];
        }
        const row = existingMarks[id];
        if (row) {
          const val = row[examType] ?? (examType === 'Semester Exam' ? row.semesterExam : examType === 'Assignment' ? row.assignment : row.practical);
          if (val !== undefined && val !== null && val !== '') return val;
        }
      }
    }

    // 3. Fallback directly to existingMarks by sid
    const directRow = existingMarks[sid];
    if (directRow) {
      const val = directRow[examType] ?? (examType === 'Semester Exam' ? directRow.semesterExam : examType === 'Assignment' ? directRow.assignment : directRow.practical);
      if (val !== undefined && val !== null && val !== '') return val;
    }

    return '';
  }

  function calculateTotal(studentOrId) {
    const sem = Number(getValue(studentOrId, 'Semester Exam')) || 0;
    const assign = Number(getValue(studentOrId, 'Assignment')) || 0;
    const prac = Number(getValue(studentOrId, 'Practical')) || 0;
    if (selectedExamType === 'All Subjects') {
      return sem + assign + prac;
    }
    return Number(getValue(studentOrId, selectedExamType)) || 0;
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
        const studentId = getStudentUserId(student, idx);
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
        marks: validStudents.map((student, idx) => {
          const studentId = getStudentUserId(student, idx);
          const sem = Number(getValue(student, 'Semester Exam')) || 0;
          const assign = Number(getValue(student, 'Assignment')) || 0;
          const prac = Number(getValue(student, 'Practical')) || 0;
          const total = sem + assign + prac;
          return {
            studentId,
            semesterExam: sem,
            assignment: assign,
            practical: prac,
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
                  className={`btn-voice-toggle ${(isListening || isSubmittingVoice) ? 'recording' : 'paused'}`}
                  onClick={(isListening || isSubmittingVoice) ? stopAllSpeechRecognition : startVoiceListening}
                >
                  {(isListening || isSubmittingVoice) ? '⏹️ Stop Listening' : '🎙️ Start Listening'}
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

            {/* Active Student & Column Voice Target Indicator */}
            {selectedCourse && students.length > 0 && (
              <div style={{
                margin: '10px 0',
                padding: '8px 14px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>🎯 Active Target: </span>
                  <strong style={{ color: '#ffffff' }}>
                    {displayName(students.find(s => {
                      const sid = s?._id || s?.userId || s?.user?._id || s?.user?.id || s?.studentId;
                      return sid === activeStudentId;
                    }) || students[0])}
                  </strong>
                  <span style={{ margin: '0 8px', color: '#64748b' }}>|</span>
                  <span style={{ color: '#94a3b8' }}>Target Column: </span>
                  <strong style={{ color: '#38bdf8' }}>{activeExamType || selectedExamType}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#a5b4fc' }}>
                  💬 Speak <strong>"mask 50"</strong> or <strong>"tell him to mask 50"</strong> to automatically show mark in column!
                </div>
              </div>
            )}

            <div style={{ margin: '8px 0 14px 0', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>Quick Voice Demos:</span>
              <button
                type="button"
                className="btn btn-voice"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => {
                  const cmd = 'mask 50';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
                title="Automatically puts 50 into active target column"
              >
                ⚡ "mask 50" (Active Target)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10b981', color: '#d1fae5', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const cmd = 'tell him to mask 52';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                ⚡ "tell him to mask 52"
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(56, 189, 248, 0.25)', border: '1px solid #38bdf8', color: '#e0f2fe', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const s = students[0];
                  const sName = s ? displayName(s) : 'Vinit Kumar';
                  const cmd = `${sName} mask 48`;
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                ⚡ "[Student] mask 48"
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(245, 158, 11, 0.25)', border: '1px solid #f59e0b', color: '#fef3c7', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const cmd = 'mask 19 assignment';
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                ⚡ "mask 19 assignment"
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(168, 85, 247, 0.25)', border: '1px solid #a855f7', color: '#f3e8ff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const s = students[0];
                  const prof = s?.profile || {};
                  const roll = prof.rollNo || prof.registerNumber || s?.rollNo || '23IT01';
                  const cmd = `${roll} mark 52`;
                  setVoiceTranscript(cmd);
                  applyAndSubmitMarks(cmd);
                }}
              >
                ⚡ "23IT01 mark 52"
              </button>
            </div>

            {voiceFeedbackMsg && (
              <div
                className="voice-status-pill"
                style={{
                  borderColor: voiceFeedbackMsg.type === 'warning' ? '#f59e0b' : '#10b981',
                  color: voiceFeedbackMsg.type === 'warning' ? '#fde68a' : '#34d399',
                  background: voiceFeedbackMsg.type === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <span>{voiceFeedbackMsg.type === 'warning' ? '⚠️' : '✅'} {voiceFeedbackMsg.text}</span>
                {(isListening || isSubmittingVoice) && (
                  <button
                    type="button"
                    onClick={stopAllSpeechRecognition}
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.8rem'
                    }}
                  >
                    ⏹️ Stop Listening
                  </button>
                )}
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
                  onClick={isSubmittingVoice ? stopAllSpeechRecognition : listenAndAutoSubmit}
                  title={isSubmittingVoice ? "Click to stop listening" : "Click to speak voice command & auto-submit"}
                >
                  {isSubmittingVoice ? '⏹️' : '🎙️'}
                </button>
              </div>

              <button
                type="button"
                className={`btn ${isSubmittingVoice ? 'btn-danger' : 'btn-voice'}`}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  background: isSubmittingVoice ? '#ef4444' : undefined,
                  borderColor: isSubmittingVoice ? '#dc2626' : undefined,
                  color: '#ffffff',
                  fontWeight: 700
                }}
                onClick={isSubmittingVoice ? stopAllSpeechRecognition : listenAndAutoSubmit}
              >
                {isSubmittingVoice ? '⏹️ Stop Listening' : '🎙️ Speak & Auto-Submit'}
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

            {/* ⚡ Quick Roll Number Mark Entry Bar */}
            <div className="quick-roll-entry-card">
              <div className="quick-roll-title">
                <span className="quick-roll-badge">⚡ Fast Roll Number Mark Entry</span>
                <span className="quick-roll-hint">See student roll number on answer sheet &rarr; enter roll and mark to automatically show in table column & save</span>
              </div>
              <form onSubmit={handleQuickRollSubmit} className="quick-roll-form">
                <div className="quick-roll-input-wrap">
                  <label>Student Roll / Reg No</label>
                  <input
                    ref={quickRollInputRef}
                    type="text"
                    placeholder="e.g. 101 or CS101"
                    value={quickRollNo}
                    onChange={e => setQuickRollNo(e.target.value)}
                    list="student-roll-list"
                    autoComplete="off"
                    required
                  />
                  <datalist id="student-roll-list">
                    {students.map(s => {
                      const prof = s?.profile || {};
                      const roll = prof.rollNo || prof.registerNumber || s?.rollNo || s?.registerNumber;
                      return roll ? <option key={roll} value={roll}>{displayName(s)} (Roll: {roll})</option> : null;
                    })}
                  </datalist>
                </div>

                <div className="quick-roll-input-wrap">
                  <label>Target Column / Exam</label>
                  <select
                    value={quickExamType}
                    onChange={e => setQuickExamType(e.target.value)}
                  >
                    <option value="Semester Exam">Semester Exam (Max 60)</option>
                    <option value="Assignment">Assignment (Max 20)</option>
                    <option value="Practical">Practical (Max 20)</option>
                  </select>
                </div>

                <div className="quick-roll-input-wrap" style={{ maxWidth: '120px' }}>
                  <label>Mark</label>
                  <input
                    type="number"
                    min="0"
                    max={markDistribution[quickExamType]?.maxMarks || 60}
                    placeholder={`0-${markDistribution[quickExamType]?.maxMarks || 60}`}
                    value={quickMark}
                    onChange={e => setQuickMark(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary quick-roll-btn" disabled={saving}>
                  ⚡ Enter Mark
                </button>
              </form>
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
                      const studentId = getStudentUserId(student, idx);
                      const total = calculateTotal(student);
                      const grade = calculateGrade(total);
                      const prof = student?.profile || {};
                      const regNo = prof.registerNumber || prof.rollNo || '-';

                      return (
                        <tr
                          key={studentId}
                          id={`student-row-${studentId}`}
                          className={`${highlightedStudentId === studentId ? 'voice-matched-row' : ''} ${activeStudentId === studentId ? 'active-focus-row' : ''}`}
                          onClick={() => setActiveStudentId(studentId)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="student-name">
                            {displayName(student)}
                            {activeStudentId === studentId && (
                              <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                ACTIVE
                              </span>
                            )}
                          </td>
                          <td className="reg-no">{regNo}</td>
                          {show('Semester Exam') && (
                            <td className={highlightedStudentId === studentId && highlightedExamType === 'Semester Exam' ? 'voice-cell-updated' : ''}>
                              <input
                                type="number"
                                id={`mark-input-${studentId}-Semester-Exam`}
                                className="mark-input"
                                min="0"
                                max="60"
                                value={getValue(student, 'Semester Exam')}
                                onFocus={() => {
                                  setActiveStudentId(studentId);
                                  setActiveExamType('Semester Exam');
                                }}
                                onChange={(e) => handleMarkChange(student, 'Semester Exam', e.target.value)}
                                placeholder="0-60"
                              />
                            </td>
                          )}
                          {show('Assignment') && (
                            <td className={highlightedStudentId === studentId && highlightedExamType === 'Assignment' ? 'voice-cell-updated' : ''}>
                              <input
                                type="number"
                                id={`mark-input-${studentId}-Assignment`}
                                className="mark-input"
                                min="0"
                                max="20"
                                value={getValue(student, 'Assignment')}
                                onFocus={() => {
                                  setActiveStudentId(studentId);
                                  setActiveExamType('Assignment');
                                }}
                                onChange={(e) => handleMarkChange(student, 'Assignment', e.target.value)}
                                placeholder="0-20"
                              />
                            </td>
                          )}
                          {show('Practical') && (
                            <td className={highlightedStudentId === studentId && highlightedExamType === 'Practical' ? 'voice-cell-updated' : ''}>
                              <input
                                type="number"
                                id={`mark-input-${studentId}-Practical`}
                                className="mark-input"
                                min="0"
                                max="20"
                                value={getValue(student, 'Practical')}
                                onFocus={() => {
                                  setActiveStudentId(studentId);
                                  setActiveExamType('Practical');
                                }}
                                onChange={(e) => handleMarkChange(student, 'Practical', e.target.value)}
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
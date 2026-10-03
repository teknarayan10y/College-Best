import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../auth/api';
import {

  FaRobot,
  FaPaperPlane,
  FaTimes,
  FaMagic,
  FaUser,
  FaSyncAlt,
  FaBookOpen,
  FaExpandAlt,
  FaCompressAlt,
  FaCopy,
  FaCheck,
  FaLightbulb,
  FaGraduationCap,
  FaCalendarCheck,
  FaFileAlt,
  FaChalkboardTeacher,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaStop,
  FaPaperclip,
  FaExternalLinkAlt,
  FaPencilAlt
} from 'react-icons/fa';
import './FacultyAiChat.css';

/**
 * Robust Parse mark entry intent from voice/text:
 * Handles natural speech, typos (e.g. particle/partical), and various syntax:
 * e.g. "student roll number 21CS001 semester mark 45 partical marks 18 assignment mark 10"
 *      "roll 21CS001 semester 55 practical 17 assignment 19"
 *      "21CS001 sem 48 assign 15 practical 16"
 */
function parseMarkEntryIntent(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();

  const isMarkIntent =
    /\b(mark|marks|score|entry|enter|add mark|update mark|semester|practical|partical|particle|assignment|assign|sem exam|cia)\b/.test(t) &&
    /\b\d+\b/.test(t);

  if (!isMarkIntent) return null;

  // 1. Roll number extraction
  const STOP_WORDS = new Set(['number', 'no', 'id', 'student', 'roll', 'mark', 'marks', 'sem', 'semester', 'exam', 'practical', 'assignment']);
  let rollNo = null;

  // Pattern A: explicitly prefixed with roll number / roll no / student / reg number
  const prefixRegex = /\b(?:roll\s*number|roll\s*no\.?|roll|register\s*number|reg\s*no\.?|reg|usn|student\s*id|student\s*roll|student)\s*[:=\s-]+\s*([a-z0-9\-_]{2,20})/gi;
  let match;
  while ((match = prefixRegex.exec(t)) !== null) {
    const candidate = match[1].toLowerCase();
    if (!STOP_WORDS.has(candidate)) {
      rollNo = match[1].toUpperCase();
      break;
    }
  }

  // Pattern B: alphanumeric token with both digits and letters (e.g. 21CS001, CS201)
  if (!rollNo) {
    const mixedMatch = t.match(/\b([0-9]{1,4}[a-z]{1,6}[0-9]{1,6}|[a-z]{1,6}[0-9]{1,6})\b/i);
    if (mixedMatch && !['cia1', 'cia2', 'sem1', 'sem2'].includes(mixedMatch[1].toLowerCase())) {
      rollNo = mixedMatch[1].toUpperCase();
    }
  }

  // Pattern C: standalone numbers when preceded by 'for' or 'to' (e.g., marks for 101)
  if (!rollNo) {
    const forMatch = t.match(/\b(?:for|student)\s+([a-z0-9\-_]{2,15})\b/i);
    if (forMatch && !STOP_WORDS.has(forMatch[1].toLowerCase())) {
      rollNo = forMatch[1].toUpperCase();
    }
  }

  if (!rollNo) return null;

  // 2. Extract semester exam marks
  const semMatch = t.match(/(?:semester(?:\s*exam)?|sem(?:\s*exam)?|theory)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);
  
  // 3. Extract assignment marks
  const assignMatch = t.match(/(?:assignment|assign|cia)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);

  // 4. Extract practical marks (also supports user typo 'partical' or 'particle')
  const practMatch = t.match(/(?:practical(?:\s*exam)?|partical(?:\s*exam)?|particle(?:\s*exam)?|lab|pract)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);

  const semesterExam = semMatch ? Number(semMatch[1]) : null;
  const assignment = assignMatch ? Number(assignMatch[1]) : null;
  const practical = practMatch ? Number(practMatch[1]) : null;

  if (semesterExam === null && assignment === null && practical === null) return null;

  return {
    rollNo,
    semesterExam: semesterExam != null ? Math.min(60, semesterExam) : 0,
    assignment: assignment != null ? Math.min(20, assignment) : 0,
    practical: practical != null ? Math.min(20, practical) : 0,
  };
}

/**
 * Detects if faculty said ONLY a roll number to initiate mark entry:
 * e.g. "roll number 23IT01", "student 23IT01", "23IT01", "enter marks for 23IT01"
 */

/**
 * Ultra-Fast Shorthand Mark Entry Parser:
 * Supports:
 * - "23IT01 45 18 19" (Roll No + Sem + Assign + Pract)
 * - "23IT01, 45, 18, 19"
 * - "23IT01 s45 a18 p19" or "23IT01 s 45 a 18 p 19"
 * - "23IT01 sem 45 as 18 pr 19"
 * - "m 23IT01 45 18 19" or "mark 23IT01 45 18 19"
 */
function parseShorthandMarkEntry(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // Pattern A: Labeled short form: "23IT01 s45 a18 p19" or "23IT01 sem 45 as 18 pr 19"
  const shorthandLabeled = t.match(/^(?:(?:mark|marks|m|add)\s+)?([a-z0-9\-_]{2,15})[\s,]+(?:s|sem)[\s:=]*(\d{1,3})[\s,]+(?:a|as|assign)[\s:=]*(\d{1,3})[\s,]+(?:p|pr|pract)[\s:=]*(\d{1,3})$/i);
  if (shorthandLabeled) {
    return {
      rollNo: shorthandLabeled[1].toUpperCase(),
      semesterExam: Math.min(60, Number(shorthandLabeled[2]) || 0),
      assignment: Math.min(20, Number(shorthandLabeled[3]) || 0),
      practical: Math.min(20, Number(shorthandLabeled[4]) || 0),
    };
  }

  // Pattern B: Ultra short numbers only: "23IT01 45 18 19" or "23IT01, 45, 18, 19" or "m 23IT01 45 18 19"
  const ultraShort = t.match(/^(?:(?:mark|marks|m|add)\s+)?([a-z0-9\-_]{2,15})[\s,/:=-]+(\d{1,3})[\s,/:=-]+(\d{1,3})[\s,/:=-]+(\d{1,3})$/i);
  if (ultraShort) {
    const candidate = ultraShort[1].toLowerCase();
    const STOP = new Set(['mark', 'marks', 'add', 'enter', 'sem', 'semester', 'exam']);
    if (!STOP.has(candidate)) {
      return {
        rollNo: ultraShort[1].toUpperCase(),
        semesterExam: Math.min(60, Number(ultraShort[2]) || 0),
        assignment: Math.min(20, Number(ultraShort[3]) || 0),
        practical: Math.min(20, Number(ultraShort[4]) || 0),
      };
    }
  }

  // Pattern C: Compact labeled without spaces: "23IT01 s45 a18 p19"
  const compactLabeled = t.match(/([a-z0-9\-_]{2,15})\s+s(\d{1,2})\s*a(\d{1,2})\s*p(\d{1,2})/i);
  if (compactLabeled) {
    return {
      rollNo: compactLabeled[1].toUpperCase(),
      semesterExam: Math.min(60, Number(compactLabeled[2]) || 0),
      assignment: Math.min(20, Number(compactLabeled[3]) || 0),
      practical: Math.min(20, Number(compactLabeled[4]) || 0),
    };
  }

  return null;
}

function detectRollNumberOnly(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();

  // Exclude general conversational queries
  if (/^(who|what|why|which|list|show|how)\b/.test(t) && !/\b(enter|add|give|put|mark|marks)\b/.test(t)) {
    return null;
  }

  const STOP_WORDS = new Set(['number', 'no', 'id', 'student', 'roll', 'mark', 'marks', 'sem', 'semester', 'exam', 'practical', 'assignment']);
  let rollNo = null;

  // Pattern 1: Explicit roll number prefix
  const explicitMatch = t.match(/\b(?:roll\s*number|roll\s*no\.?|roll|register\s*number|reg\s*no\.?|reg|student(?:\s*roll|\s*id)?|usn)\s*[:=\s-]+\s*([a-z0-9\-_]{2,20})/i);
  if (explicitMatch && !STOP_WORDS.has(explicitMatch[1].toLowerCase())) {
    rollNo = explicitMatch[1].toUpperCase();
  }

  // Pattern 2: 'enter marks for 23IT01' or 'marks for 23IT01'
  if (!rollNo) {
    const forMatch = t.match(/\b(?:mark\s*entry\s*(?:for)?|enter\s*marks?\s*(?:for)?|marks?\s*for)\s+([a-z0-9\-_]{2,15})/i);
    if (forMatch && !STOP_WORDS.has(forMatch[1].toLowerCase())) {
      rollNo = forMatch[1].toUpperCase();
    }
  }

  // Pattern 3: Standalone alphanumeric roll code (e.g., '23IT01', '21CS001')
  if (!rollNo && /^[0-9]{1,4}[a-z]{1,6}[0-9]{1,6}$/i.test(t)) {
    rollNo = t.toUpperCase();
  }

  return rollNo;
}

/**
 * Parses marks values when roll number is already established:
 * e.g. "semester 45 assignment 18 practical 19", "sem 50 assign 18 practical 16", or "45 18 19"
 */
function parseMarksOnly(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();

  if (/^(cancel|abort|stop|no|exit|back)$/.test(t)) {
    return { cancel: true };
  }

  // Labeled compact: s45 a18 p19 or s 45 a 18 p 19
  const compact = t.match(/s\s*(\d{1,2})\s*a\s*(\d{1,2})\s*p\s*(\d{1,2})/);
  if (compact) {
    return {
      semesterExam: Math.min(60, Number(compact[1]) || 0),
      assignment: Math.min(20, Number(compact[2]) || 0),
      practical: Math.min(20, Number(compact[3]) || 0)
    };
  }

  const semMatch = t.match(/(?:semester(?:\s*exam)?|sem(?:\s*exam)?|theory|\bs\b)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);
  const assignMatch = t.match(/(?:assignment|assign|cia|\bas\b|\ba\b)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);
  const practMatch = t.match(/(?:practical(?:\s*exam)?|partical(?:\s*exam)?|particle(?:\s*exam)?|lab|pract|\bpr\b|\bp\b)(?:\s*(?:mark|marks|score))?\s*[:=\s-]*\s*(\d{1,3})/);

  let semesterExam = semMatch ? Number(semMatch[1]) : null;
  let assignment = assignMatch ? Number(assignMatch[1]) : null;
  let practical = practMatch ? Number(practMatch[1]) : null;

  // Fallback: 2 or 3 space/comma-separated numbers (e.g. "45 18 19" or "45, 18, 19")
  if (semesterExam === null && assignment === null && practical === null) {
    const nums = t.match(/\b\d{1,3}\b/g);
    if (nums && nums.length >= 1) {
      semesterExam = Number(nums[0]) || 0;
      assignment = nums.length > 1 ? Number(nums[1]) : 0;
      practical = nums.length > 2 ? Number(nums[2]) : 0;
    }
  }

  if (semesterExam === null && assignment === null && practical === null) return null;

  return {
    semesterExam: Math.min(60, semesterExam || 0),
    assignment: Math.min(20, assignment || 0),
    practical: Math.min(20, practical || 0)
  };
}

const CATEGORIES = [
  { id: 'all', label: '✨ All Smart Prompts', icon: <FaLightbulb /> },
  { id: 'attendance', label: '📅 Class Attendance', icon: <FaCalendarCheck /> },
  { id: 'assignments', label: '📝 Submissions & Tasks', icon: <FaFileAlt /> },
  { id: 'marks', label: '🎓 Student Marks & CIA', icon: <FaGraduationCap /> },
  { id: 'teaching', label: '👨‍🏫 My Profile & Schedule', icon: <FaChalkboardTeacher /> },
  { id: 'regulations', label: '📖 College Regulations', icon: <FaBookOpen /> },
];

const ALL_QUICK_CHIPS = [
    { cat: 'marks', label: '⚡ Quick Marks: 23IT01 45 18 19', query: '23IT01 45 18 19' },
  { cat: 'marks', label: '🎯 Voice Mark Entry', query: 'Enter marks for roll number 21CS001 semester mark 52 practical marks 18 assignment marks 19' },
  { cat: 'attendance', label: '🚨 At-Risk Students Early Warning', query: 'Which students are at risk of shortage and what is our class attendance velocity?' },
  { cat: 'attendance', label: '📈 Class Forecast & Velocity Trajectory', query: 'What is our class attendance velocity and projected pass rate?' },
  { cat: 'assignments', label: '💡 Generate 5-Question Quiz on Core Units', query: 'Generate a 5-question multiple choice quiz on core concepts with answer key and explanations' },
  { cat: 'attendance', label: '📢 Draft Warning Notices for At-Risk Students', query: 'Draft warning notices for all students with attendance below 75% prioritizing urgent cases' },
  { cat: 'attendance', label: '🧪 What-If Remedial Lecture Simulation', query: 'Simulate What-If scenario: What happens to cohort pass rate if we add 5 remedial classes and recover attendance by 8%?' },
  { cat: 'marks', label: '💡 How to Improve Class Performance', query: 'How can I improve class attendance and pass rates?' },
  { cat: 'attendance', label: '❓ How Many Absent Today?', query: 'How many students are absent today?' },
  { cat: 'attendance', label: "📋 Today's Class Absentees", query: 'Who is absent today in my classes?' },
  { cat: 'attendance', label: "🗓️ Yesterday's Absentees", query: 'Who was absent yesterday?' },
  { cat: 'attendance', label: '⚠️ Students Below 75% Attendance', query: 'Which students have attendance below 75%?' },
  { cat: 'attendance', label: '📊 Subject Attendance Summary', query: 'Show class attendance percentage for my subjects' },
  { cat: 'assignments', label: '📄 Who Submitted Assignment 1?', query: 'Who submitted Assignment 1?' },
  { cat: 'assignments', label: '⏳ Pending Assignment Submissions', query: 'Which students have not submitted the assignment yet?' },
  { cat: 'assignments', label: '📑 Coursework Summary', query: 'List all assignments and submission counts' },
  { cat: 'marks', label: '📊 CIA-1 Class Average', query: 'What is the average class score in CIA-1?' },
  { cat: 'marks', label: '🌟 Top Performers in My Subjects', query: 'Show top performers in my courses' },
  { cat: 'marks', label: '📈 Student Marks Summary', query: 'Show internal marks summary for my classes' },
  { cat: 'teaching', label: '📅 My Personal Attendance %', query: 'What is my personal attendance percentage?' },
  { cat: 'teaching', label: '📚 My Courses & Student Count', query: 'Show my courses and student counts' },
  { cat: 'teaching', label: '👨‍🏫 My Faculty Profile', query: 'Show my faculty profile' },
  { cat: 'regulations', label: '⚖️ Internal Exam Weightage', query: 'What is the internal vs semester exam weightage and passing minimum?' },
  { cat: 'regulations', label: '📖 Attendance Condonation Rules', query: 'What are the college rules for attendance shortage and condonation?' }
];

const INITIAL_MESSAGE = {
  id: 'faculty-init-msg',
  sender: 'ai',
  text: "👋 **Welcome to Faculty AI!**\n\nI am your **AI Teaching & Course Management Co-Pilot**, connected in real-time to your Faculty Portal. Ask me about **student absentees**, **assignment submissions**, **CIA marks**, or **your own schedule** by typing or speaking through your microphone!\n\n💡 *Tip: You can also enter marks by voice! Try: \"Roll 21CS001 semester 45 assignment 18 practical 19\"*",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  sources: []
};

/**
 * Utility to strip markdown and emojis for clean, natural speech synthesis
 */
function cleanTextForSpeech(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/!\[.*?\]\(.*?\)/g, '') // remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links to label
    .replace(/[#*_`~>]/g, '') // markdown tokens
    .replace(/[-â€¢]/g, ' ') // bullet points to pauses
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emojis
    .replace(/\s+/g, ' ')
    .trim();
}

export default function FacultyAiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [windowMode, setWindowMode] = useState('normal'); // 'normal' | 'expanded'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [showWelcomeTooltip, setShowWelcomeTooltip] = useState(true);

  // VOICE ASSISTANT STATES
  const [isVoiceMode, setIsVoiceMode] = useState(
    localStorage.getItem('faculty_ai_voice_mode') === 'true'
  );
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);

  // Mark Entry via AI states
  const [facultyCourses, setFacultyCourses] = useState([]);
  const [selectedCourseForMarks, setSelectedCourseForMarks] = useState('');
  const [markEntryPending, setMarkEntryPending] = useState(null); // { rollNo, semesterExam, assignment, practical }
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  // Clean up Web Speech on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  // Filter chips based on active category
  const filteredChips = ALL_QUICK_CHIPS.filter(
    chip => selectedCategory === 'all' || chip.cat === selectedCategory
  );

  /**
   * SPEAK MESSAGE WITH WEB SPEECH SYNTHESIS (Natural Female Voice)
   */
  const speakMessage = (textToSpeak, msgId) => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    const synth = window.speechSynthesis;

    // If currently speaking this message, toggle stop
    if (speakingMsgId === msgId) {
      synth.cancel();
      setSpeakingMsgId(null);
      return;
    }

    synth.cancel(); // Stop any other playing audio

    const cleanText = cleanTextForSpeech(textToSpeak);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    // Pick a high quality natural English voice
    const voices = synth.getVoices();
    const preferredVoice = voices.find(v =>
      (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Female')) &&
      v.lang.startsWith('en')
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      setSpeakingMsgId(msgId);
    };

    utterance.onend = () => {
      setSpeakingMsgId(null);
    };

    utterance.onerror = () => {
      setSpeakingMsgId(null);
    };

    synth.speak(utterance);
  };

  /**
   * VOICE INPUT (Speech-to-Text via Web Speech API)
   */
  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setVoiceNotice('');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice('Listening... Speak your question now');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setVoiceNotice('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceNotice('');
      };

      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
      setVoiceNotice('');
    }
  };

  const toggleVoiceMode = () => {
    const nextVal = !isVoiceMode;
    setIsVoiceMode(nextVal);
    localStorage.setItem('faculty_ai_voice_mode', String(nextVal));
    if (!nextVal && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  };


  // Fetch faculty courses for mark entry selector
  useEffect(() => {
    api.facultyCourses().then(data => {
      const list = data?.items || data?.courses || (Array.isArray(data) ? data : []);
      setFacultyCourses(list);
      // Keep selectedCourseForMarks as '' (None) by default unless previously set
    }).catch(err => console.error('[FacultyCourses Load]', err));
  }, [isOpen]);

  /**
   * Handle mark entry via AI (voice or text)
   */
  const handleMarkEntryVoice = async (parsed) => {
    const courseId = selectedCourseForMarks;
    if (!courseId) {
      setLoading(false);
      const needCourseMsg = {
        id: `ai-select-course-${Date.now()}`,
        sender: 'ai',
        text: `✏️ **Please Select a Subject First!**\n\nBefore entering marks for student **${parsed.rollNo}**, please select your subject from the **MARK ENTRY COURSE** dropdown above the chat input, then try again.\n\n*(When you are done entering marks, you can switch it back to **None** anytime).* `,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: []
      };
      setMessages(prev => [...prev, needCourseMsg]);
      return;
    }

    setLoading(true);
    try {
      const res = await api.facultyAiMarkEntry({
        courseId,
        rollNo: parsed.rollNo,
        semesterExam: parsed.semesterExam,
        assignment: parsed.assignment,
        practical: parsed.practical,
      });

      const total = (parsed.semesterExam || 0) + (parsed.assignment || 0) + (parsed.practical || 0);
      const courseName = facultyCourses.find(c => (c._id || c.id) === courseId)?.name || 'Course';
      const successMsg = {
        id: `ai-marks-${Date.now()}`,
        sender: 'ai',
        text: `✅ **Marks Saved Successfully!**\n\n` +
          `👤 **Student:** ${res.studentName} (Roll No: ${parsed.rollNo})\n` +
          `📚 **Course:** ${res.courseName || courseName}\n\n` +
          `| Type | Marks |\n|------|-------|\n` +
          `| 📝 Semester Exam | **${parsed.semesterExam}/60** |\n` +
          `| 📋 Assignment | **${parsed.assignment}/20** |\n` +
          `| 🔬 Practical | **${parsed.practical}/20** |\n` +
          `| **Total** | **${res.total}/100** |\n` +
          `| **Grade** | **${res.grade}** |\n\n` +
          `📣 Student has been notified automatically. Marks are now visible in their Exam portal.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: []
      };
      setMessages(prev => [...prev, successMsg]);
      if (isVoiceMode) {
        setTimeout(() => speakMessage(`Marks saved successfully for ${res.studentName}. Total ${res.total} out of 100. Grade ${res.grade}.`, successMsg.id), 200);
      }
    } catch (err) {
      const errMsg = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `❌ **Mark Entry Failed:** ${err.message || 'Could not save marks. Please check the roll number and try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: []
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };
  const handleSend = async (customQuery = null) => {
    const textToSend = (customQuery || input).trim();
    if (!textToSend && !attachedFile) return;
    if (loading) return;

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }

    const fileToSend = attachedFile;
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend || `“Ž ${fileToSend?.name}`,
      attachedFile: fileToSend ? fileToSend.name : null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customQuery) setInput('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setLoading(true);
    // ── 2-STEP & 1-STEP MARK ENTRY INTENT ──
    // Step 0: Check Ultra-Fast Shorthand (e.g., "23IT01 45 18 19" or "23IT01 s45 a18 p19")
    const shortParsed = parseShorthandMarkEntry(textToSend);
    if (shortParsed) {
      setMarkEntryPending(null);
      await handleMarkEntryVoice(shortParsed);
      return;
    }

    // Step 2: If a student roll number is already pending, extract the marks:
    if (markEntryPending) {
      const parsedMarks = parseMarksOnly(textToSend);
      if (parsedMarks) {
        if (parsedMarks.cancel) {
          setMarkEntryPending(null);
          setLoading(false);
          const cancelMsg = {
            id: `ai-cancel-${Date.now()}`,
            sender: 'ai',
            text: `❌ Mark entry for Roll Number **${markEntryPending.rollNo}** was cancelled.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sources: []
          };
          setMessages(prev => [...prev, cancelMsg]);
          return;
        }

        const completeMarkData = {
          rollNo: markEntryPending.rollNo,
          semesterExam: parsedMarks.semesterExam,
          assignment: parsedMarks.assignment,
          practical: parsedMarks.practical
        };
        setMarkEntryPending(null);
        await handleMarkEntryVoice(completeMarkData);
        return;
      }
    }

    // Step 1: Check if user provided BOTH Roll Number & Marks in a single command
    const markParsed = parseMarkEntryIntent(textToSend);
    if (markParsed) {
      setMarkEntryPending(null);
      await handleMarkEntryVoice(markParsed);
      return;
    }

    // Step 1 (Alternative): Check if faculty specified ONLY the Roll Number first:
    const rollOnly = detectRollNumberOnly(textToSend);
    if (rollOnly) {
      setMarkEntryPending({ rollNo: rollOnly });
      setLoading(false);

      if (!selectedCourseForMarks) {
        setLoading(false);
        const needCourseMsg = {
          id: `ai-select-course-${Date.now()}`,
          sender: 'ai',
          text: `✏️ **Please Select a Subject First!**\n\nTo enter marks for Roll Number **${rollOnly}**, please choose a subject from the **MARK ENTRY COURSE** dropdown above the chat input first.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sources: []
        };
        setMessages(prev => [...prev, needCourseMsg]);
        return;
      }
      const courseName = facultyCourses.find(c => (c._id || c.id) === selectedCourseForMarks)?.name || 'Selected Course';

      const promptMsg = {
        id: `ai-roll-${Date.now()}`,
        sender: 'ai',
        text: `🎯 **Ready for Mark Entry**\n\n` +
          `👤 **Roll Number:** **${rollOnly}**\n` +
          `📚 **Course:** ${courseName}\n\n` +
          `🎙️ **Please tell me the marks for this student:**\n` +
          `• 📝 Semester Exam (Max 60)\n` +
          `• 📋 Assignment (Max 20)\n` +
          `• 🔬 Practical (Max 20)\n\n` +
          `👉 *Speak or type:* **"45 18 19"** *(or **"s45 a18 p19"** / **"Semester 45, assignment 18, practical 19"**)*\n` +
          `*(Say "cancel" to abort)*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: []
      };
      setMessages(prev => [...prev, promptMsg]);
      if (isVoiceMode) {
        setTimeout(() => speakMessage(`Roll number ${rollOnly} selected for ${courseName}. Please speak or enter the marks.`, promptMsg.id), 200);
      }
      return;
    }
    try {
      const res = await api.facultyAiChat(textToSend || `Analyse this file: ${fileToSend?.name}`, fileToSend);
      const aiReplyText = res?.reply || 'I could not process that request. Please try again.';
      const newMsgId = `ai-${Date.now()}`;

      const aiMsg = {
        id: newMsgId,
        sender: 'ai',
        text: aiReplyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: res?.sources || [],
        model: res?.model
      };

      setMessages(prev => [...prev, aiMsg]);

      // Automatically speak the response if Voice Mode is active
      if (isVoiceMode) {
        setTimeout(() => speakMessage(aiReplyText, newMsgId), 200);
      }
    } catch (err) {
      const errorMsg = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `âš ï¸ **Error connecting to Faculty AI:** ${err.message || 'Unable to retrieve faculty database records.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: []
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefresh = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakingMsgId(null);
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setInput('');
    setMessages([INITIAL_MESSAGE]);
  };

  /**
   * Rich message formatting with modern markdown, code blocks, images, links & bold text
   */
  const formatMessageText = (content) => {
    if (!content) return null;
    const lines = content.split('\n');

    return lines.map((line, lIdx) => {
      const isBullet = line.trim().startsWith('â€¢') || line.trim().startsWith('-') || /^\d+\./.test(line.trim());
      const parts = line.split(/(!\[.*?\]\([^\s\)]+\)|\[.*?\]\([^\s\)]+\)|https?:\/\/[^\s\)]+|\*\*.*?\*\*)/g);

      const formattedLine = parts.map((part, pIdx) => {
        // Markdown image ![alt](url)
        const mdImgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (mdImgMatch) {
          const [, alt, url] = mdImgMatch;
          return (
            <div key={pIdx} className="modern-chat-image-card">
              <img src={url} alt={alt || 'Profile Photo'} className="modern-chat-img" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="modern-img-view-btn">
                <FaExternalLinkAlt /> Open Original
              </a>
            </div>
          );
        }

        // Markdown link [Label](url)
        const mdLinkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\s\)]+)\)$/);
        if (mdLinkMatch) {
          const [, label, url] = mdLinkMatch;
          return (
            <a
              key={pIdx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="modern-chat-link"
            >
              <span>{label}</span>
              <FaExternalLinkAlt className="link-ext-icon" />
            </a>
          );
        }

        // Raw HTTP URL
        if (/^https?:\/\/[^\s]+$/.test(part)) {
          return (
            <a
              key={pIdx}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="modern-chat-link"
            >
              <span>{part}</span>
              <FaExternalLinkAlt className="link-ext-icon" />
            </a>
          );
        }

        // Bold text **text**
        const boldMatch = part.match(/^\*\*(.*?)\*\*$/);
        if (boldMatch) {
          return (
            <strong key={pIdx} className="modern-highlight-text">
              {boldMatch[1]}
            </strong>
          );
        }

        return <span key={pIdx}>{part}</span>;
      });

      return (
        <div key={lIdx} className={`modern-chat-line ${isBullet ? 'bullet-line' : ''}`}>
          {formattedLine}
        </div>
      );
    });
  };

  return (
    <div className="faculty-ai-modern-root">
      {/* FLOATING TRIGGER BUTTON */}
      {!isOpen && (
        <div className="modern-launcher-wrapper">
          {showWelcomeTooltip && (
            <div className="modern-launcher-tooltip" onClick={() => setIsOpen(true)}>
              <span className="tooltip-sparkle"><FaMagic /></span>
              <span>Ask Faculty AI: Absentees, Submissions, CIA Marks!</span>
              <button
                className="tooltip-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWelcomeTooltip(false);
                }}
                title="Dismiss"
              >
                <FaTimes />
              </button>
            </div>
          )}

          <button
            className="modern-ai-trigger"
            onClick={() => {
              setIsOpen(true);
              setShowWelcomeTooltip(false);
            }}
            title="Open Faculty AI Co-Pilot"
          >
            <div className="trigger-aura-glow"></div>
            <div className="trigger-icon-orb">
              <FaRobot />
            </div>
            <div className="trigger-content">
              <span className="trigger-title">Faculty AI</span>
              <span className="trigger-sub">Teaching Co-Pilot</span>
            </div>
            <div className="trigger-live-indicator"></div>
          </button>
        </div>
      )}

      {/* CHAT WINDOW INTERFACE */}
      {isOpen && (
        <div className={`modern-ai-window ${windowMode === 'expanded' ? 'is-expanded' : ''}`}>
          {/* TOP AURORA HEADER */}
          <header className="modern-chat-header">
            <div className="header-left">
              <div className="ai-avatar-orb">
                <FaRobot />
                <span className="orb-status-ring"></span>
              </div>
              <div className="header-meta">
                <div className="title-row">
                  <h3>Faculty AI</h3>
                  <span className="ai-version-tag">Pro</span>
                </div>
                <div className="status-row">
                  <span className="live-pulse-dot"></span>
                  <span className="status-text">Connected to Faculty Portal</span>
                </div>
              </div>
            </div>

            <div className="header-actions">
              {/* Voice Mode Toggle Button */}
              <button
                className={`ai-header-btn ai-voice-toggle-btn ${isVoiceMode ? 'is-voice-on' : ''}`}
                onClick={toggleVoiceMode}
                title={isVoiceMode ? 'Voice Answers: ON (AI will speak aloud)' : 'Voice Answers: OFF (Text only)'}
              >
                {isVoiceMode ? <FaVolumeUp /> : <FaVolumeMute />}
              </button>

              {/* Window Expand Toggle */}
              <button
                className="ai-header-btn ai-expand-btn"
                onClick={() => setWindowMode(windowMode === 'normal' ? 'expanded' : 'normal')}
                title={windowMode === 'normal' ? 'Expand Studio View' : 'Collapse View'}
              >
                {windowMode === 'normal' ? <FaExpandAlt /> : <FaCompressAlt />}
              </button>

              {/* Close Button */}
              <button
                className="ai-header-btn ai-close-btn"
                onClick={() => {
                  if (window.speechSynthesis) window.speechSynthesis.cancel();
                  setSpeakingMsgId(null);
                  setIsOpen(false);
                }}
                title="Close Window"
              >
                <FaTimes />
              </button>
            </div>
          </header>

          {/* TOPIC CATEGORIES TABS */}
          <div className="modern-categories-bar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="cat-icon">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* QUICK PROMPT CHIPS CAROUSEL */}
          <div className="modern-chips-carousel">
            {filteredChips.map((chip, idx) => (
              <button
                key={idx}
                className="modern-chip-card"
                onClick={() => handleSend(chip.query)}
                disabled={loading}
              >
                <span className="chip-label">{chip.label}</span>
              </button>
            ))}
          </div>

          {/* MESSAGES THREAD */}
          <div className="modern-messages-viewport">
            {messages.map((msg) => (
              <div
                key={msg.id || msg.timestamp}
                className={`modern-msg-row ${msg.sender === 'user' ? 'is-user' : 'is-ai'}`}
              >
                <div className="msg-avatar-badge">
                  {msg.sender === 'user' ? <FaUser /> : <FaRobot />}
                </div>

                <div className="modern-msg-bubble">
                  {msg.attachedFile && (
                    <div className="user-msg-file-badge">
                      <FaPaperclip className="msg-file-icon" />
                      <span>{msg.attachedFile}</span>
                    </div>
                  )}
                  <div className="msg-text-content">
                    {formatMessageText(msg.text)}
                  </div>

                  {/* Grounded Sources Pill Container */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="modern-sources-box">
                      <div className="sources-header">
                        <FaBookOpen />
                        <span>Referenced Institutional Regulations:</span>
                      </div>
                      <div className="sources-chips-grid">
                        {msg.sources.map((s, sIdx) => (
                          <div key={sIdx} className="source-pill">
                            <span className="source-dot"></span>
                            <span className="source-name">{s.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bubble Footer with Listen & Copy Buttons */}
                  <div className="modern-msg-footer">
                    <span className="msg-time">{msg.timestamp}</span>

                    {msg.sender === 'ai' && (
                      <div className="msg-footer-actions">
                        {/* Read Aloud Button */}
                        <button
                          className={`read-aloud-btn ${speakingMsgId === msg.id ? 'is-speaking' : ''}`}
                          onClick={() => speakMessage(msg.text, msg.id)}
                          title={speakingMsgId === msg.id ? 'Stop Speaking' : 'Read Aloud'}
                        >
                          {speakingMsgId === msg.id ? (
                            <>
                              <FaStop className="speak-icon stop-icon" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <FaVolumeUp className="speak-icon" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>

                        {/* Copy Button */}
                        <button
                          className="copy-msg-btn"
                          onClick={() => handleCopyMessage(msg.text, msg.id)}
                          title="Copy message to clipboard"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <FaCheck className="copy-icon copied" />
                              <span className="copied-text">Copied</span>
                            </>
                          ) : (
                            <>
                              <FaCopy className="copy-icon" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Glowing Thinking Wave Indicator */}
            {loading && (
              <div className="modern-msg-row is-ai is-loading-row">
                <div className="msg-avatar-badge ai-pulsing">
                  <FaMagic />
                </div>
                <div className="modern-msg-bubble loading-bubble">
                  <div className="modern-typing-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="thinking-text">Analyzing your Faculty Portal records...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* FLOATING MODERN INPUT CONTAINER WITH MICROPHONE & REFRESH */}
          <footer className="modern-input-wrapper">
            {/* ── AI MARK ENTRY COURSE SELECTOR ── */}
            <div className="ai-mark-course-bar">
                <FaPencilAlt className="ai-mark-course-icon" />
                <span className="ai-mark-course-label">Mark Entry Course:</span>
                {facultyCourses.length > 0 ? (
                  <select
                    className="ai-mark-course-select"
                    value={selectedCourseForMarks}
                    onChange={e => setSelectedCourseForMarks(e.target.value)}
                    title="Select course for voice/text mark entry"
                  >
                    <option value="">None</option>
                    {facultyCourses.map(c => (
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.name || c.code || 'Course'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="ai-mark-course-auto">
                    {selectedCourseForMarks ? 'Course Selected' : 'Auto-Sync with Active Course'}
                  </span>
                )}
              </div>
            {voiceNotice && (
              <div className="voice-listening-banner">
                <span className="pulse-mic-dot"></span>
                <span>{voiceNotice}</span>
              </div>
            )}

            {/* Attached File Preview Floating Card */}
            {markEntryPending && (
              <div className="attached-file-preview-bar">
                <div className="attached-file-chip" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))', borderColor: '#818cf8' }}>
                  <span style={{ fontSize: '13px' }}>🎯</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e7ff' }}>
                    Entering marks for Roll: <strong>{markEntryPending.rollNo}</strong>
                  </span>
                  <button
                    type="button"
                    className="file-chip-remove-btn"
                    onClick={() => setMarkEntryPending(null)}
                    title="Cancel Mark Entry"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
            )}
            {attachedFile && (
              <div className="attached-file-preview-bar">
                <div className="attached-file-chip">
                  <div className="file-chip-icon-box">
                    <FaFileAlt className="file-chip-icon" />
                  </div>
                  <div className="file-chip-info">
                    <span className="file-chip-name" title={attachedFile.name}>
                      {attachedFile.name}
                    </span>
                    <span className="file-chip-size">
                      {attachedFile.size ? (attachedFile.size < 1048576 ? (attachedFile.size / 1024).toFixed(1) + ' KB' : (attachedFile.size / 1048576).toFixed(1) + ' MB') : 'Ready'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="file-chip-remove-btn"
                    onClick={() => {
                      setAttachedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    title="Remove attached file"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
            )}

            <div className="modern-input-card">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.csv,.xlsx,.xls,.json,.txt,.md,.docx"
                onChange={e => setAttachedFile(e.target.files[0] || null)}
              />

              <button
                type="button"
                className="modern-refresh-input-btn"
                onClick={handleRefresh}
                title="Clear & Reset Conversation"
                disabled={loading}
              >
                <FaSyncAlt />
              </button>

              {/* “Ž Attach File Button */}
              <button
                type="button"
                className={`modern-attach-btn ${attachedFile ? 'has-file' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                title={attachedFile ? `Attached: ${attachedFile.name} (Click to replace)` : "Attach a file (PDF, CSV, Excel, JSON, TXT...)"}
                disabled={loading}
              >
                <FaPaperclip />
                {attachedFile && <span className="attach-btn-dot" />}
              </button>

              <textarea
                ref={textareaRef}
                className="modern-textarea"
                placeholder={isListening ? "Listening... Speak your question" : attachedFile ? "Ask anything about the attached file..." : "Ask FacultyAI or attach a file (PDF, CSV, Excel...)"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />

              <div className="input-right-actions">
                {/* Voice Input Mic Button */}
                <button
                  className={`modern-mic-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleVoiceInput}
                  disabled={loading}
                  title={isListening ? "Listening... Click to stop" : "Speak your question (Microphone)"}
                >
                  {isListening ? <FaMicrophoneSlash /> : <FaMicrophone />}
                </button>

                {/* Send Button */}
                <button
                  className={`modern-send-btn ${(input.trim() || attachedFile) && !loading ? 'can-send' : ''}`}
                  onClick={() => handleSend()}
                  disabled={(!input.trim() && !attachedFile) || loading}
                  title="Send message (Enter)"
                >
                  <FaPaperPlane />
                </button>
              </div>
            </div>

            <div className="input-footer-hint">
              <span>{isVoiceMode ? '🎙️ Voice Mode ON (AI speaks responses)' : '💬 Text Only Mode'} • Press <strong>Enter ↵</strong> to send</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}






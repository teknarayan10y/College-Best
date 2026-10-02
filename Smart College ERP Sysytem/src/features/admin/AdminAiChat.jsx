// src/features/admin/AdminAiChat.jsx
import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../auth/api';

import {
  FaRobot,
  FaPaperPlane,
  FaTimes,
  FaMagic,
  FaUserShield,
  FaSyncAlt,
  FaBookOpen,
  FaExpandAlt,
  FaCompressAlt,
  FaCopy,
  FaCheck,
  FaLightbulb,
  FaGraduationCap,
  FaChalkboardTeacher,
  FaCalendarCheck,
  FaBuilding,
  FaFileAlt,
  FaExternalLinkAlt,
  FaPaperclip,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaStop
} from 'react-icons/fa';
import './AdminAiChat.css';

const CATEGORIES = [
  { id: 'all', label: '✨ All Smart Prompts', icon: <FaLightbulb /> },
  { id: 'institution', label: '🏛️ College Overview', icon: <FaBuilding /> },
  { id: 'students', label: '🎓 Students & CGPA', icon: <FaGraduationCap /> },
  { id: 'faculty', label: '👨‍🏫 Faculty & Workload', icon: <FaChalkboardTeacher /> },
  { id: 'attendance', label: '📊 Attendance & Shortage', icon: <FaCalendarCheck /> },
  { id: 'academics', label: '📝 Courses & Assignments', icon: <FaFileAlt /> },
];

const ALL_QUICK_CHIPS = [
  { cat: 'institution', label: '🏛️ Campus Velocity & 30-Day Forecast', query: 'What is our campus attendance velocity and 30-day projection?' },
  { cat: 'institution', label: '🏥 Department Health Scores (0-100)', query: 'Show department health scores and which department is lowest' },
  { cat: 'attendance', label: '⚠️ Statistical Attendance Anomalies', query: 'Are there any statistical attendance anomalies or shortage clusters?' },
  { cat: 'attendance', label: '🧪 What-If Condonation Simulation (70%)', query: 'Run a What-If simulation: What is the impact if condonation cutoff is lowered to 70%?' },
  { cat: 'institution', label: '💡 How to Improve Campus Retention', query: 'How can we improve college attendance and reduce student dropout risks?' },
  { cat: 'institution', label: '🏛️ College Institution Summary', query: 'Show the college overview statistics and student count' },
  { cat: 'faculty', label: '🆔 All Faculty IDs', query: 'List all faculty IDs and departments' },
  { cat: 'students', label: '🆔 All Student IDs & Roll Numbers', query: 'List all student IDs and roll numbers' },
  { cat: 'attendance', label: '📊 College Overall Attendance', query: 'What is the college-wide student attendance average?' },
  { cat: 'attendance', label: '🚨 Attendance Shortage Students (<75%)', query: 'Which students have attendance shortage below 75%?' },
  { cat: 'attendance', label: '📅 Today\'s Absentees', query: 'How many students are absent today?' },
  { cat: 'faculty', label: '👨‍🏫 Faculty Members & Workload', query: 'List all faculty members and their assigned courses' },
  { cat: 'students', label: '🎓 Student Records & CGPA', query: 'Show the student roster with department and CGPA' },
  { cat: 'institution', label: '🏢 Departments & HODs', query: 'List all college departments and their HODs' },
  { cat: 'academics', label: '📝 Active Coursework & Submissions', query: 'Show active assignments and submission statistics' },
  { cat: 'all', label: '📜 College Academic Policies', query: 'What are the institutional regulations regarding attendance and exam eligibility?' }
];

const INITIAL_MESSAGE = {
  id: 'init-admin-msg',
  sender: 'ai',
  text: `👋 **Welcome Super Admin!**\n\nI am your **Omniscient Admin AI Co-Pilot**, connected in real-time to **both Faculty and Student databases**. Ask me anything about any faculty member, any student, college-wide attendance, or departmental analytics! (Add *"in detail"* for complete breakdowns).`,
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
    .replace(/[#*_`~>|]/g, '') // markdown tokens
    .replace(/[-•]/g, ' ') // bullet points to pauses
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emojis
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Select the highest quality natural female voice available
 */
function getFemaleVoice(voices) {
  if (!voices || voices.length === 0) return null;
  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Zira',
    'Microsoft Jenny',
    'Samantha',
    'Victoria',
    'Karen'
  ];

  for (const name of preferred) {
    const v = voices.find(voice => voice.name.toLowerCase().includes(name.toLowerCase()));
    if (v) return v;
  }

  const anyEnglish = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Samantha')));
  return anyEnglish || voices.find(v => v.lang.startsWith('en')) || voices[0];
}

export default function AdminAiChat() {
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
    localStorage.getItem('admin_ai_voice_mode') === 'true'
  );
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setShowWelcomeTooltip(false);
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [messages, isOpen, windowMode]);

  // Dismiss tooltip after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowWelcomeTooltip(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Prime speech synthesis voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Toggle Voice Mode (auto speak answers)
  const toggleVoiceMode = () => {
    const nextVal = !isVoiceMode;
    setIsVoiceMode(nextVal);
    localStorage.setItem('admin_ai_voice_mode', String(nextVal));

    if (!nextVal && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  };

  // Text-To-Speech (Read Aloud)
  const speakMessage = (text, id) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    if (speakingMsgId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.06;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = getFemaleVoice(voices);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    utterance.onstart = () => setSpeakingMsgId(id);
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    window.speechSynthesis.speak(utterance);
  };

  // Speech-To-Text (Voice Input) with Auto-Send
  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
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
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;

      let finalCapturedText = '';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice('🎙️ Listening... Speak your query now');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          finalCapturedText = transcript;
          setInput(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setVoiceNotice(event.error === 'not-allowed' ? '⚠️ Microphone permission denied' : 'Speech error');
        setTimeout(() => setVoiceNotice(''), 3500);
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceNotice('');

        if (finalCapturedText && finalCapturedText.trim()) {
          const textToSend = finalCapturedText.trim();
          setInput('');
          handleSend(textToSend);
        } else {
          setTimeout(() => textareaRef.current?.focus(), 100);
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const handleRefresh = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakingMsgId(null);
    setMessages([
      {
        ...INITIAL_MESSAGE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setInput('');
    setLoading(false);
  };

  const handleCopyMessage = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (queryText) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() && !attachedFile) return;
    if (loading) return;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakingMsgId(null);

    const fileToSend = attachedFile;
    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim() || `📎 ${fileToSend?.name}`,
      attachedFile: fileToSend ? fileToSend.name : null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!queryText) setInput('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setLoading(true);

    try {
      const res = await api.adminAiChat(textToSend.trim() || `Analyse this file: ${fileToSend?.name}`, fileToSend);
      const aiReply = res?.reply || 'Sorry, I could not process your query at this moment.';
      const sources = res?.sources || [];
      const aiMsgId = `ai-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          sender: 'ai',
          text: aiReply,
          sources,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      if (isVoiceMode) {
        setTimeout(() => speakMessage(aiReply, aiMsgId), 300);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Connection Error:** ${err.message || 'Unable to connect to the Admin AI engine. Please verify server connection.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
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

  // Filter chips based on active category
  const filteredChips = selectedCategory === 'all'
    ? ALL_QUICK_CHIPS
    : ALL_QUICK_CHIPS.filter(c => c.cat === selectedCategory || c.cat === 'all');

  // Rich message formatting with markdown links, bold highlights & bullet styling
  const formatMessageText = (content) => {
    if (!content) return null;
    const lines = content.split('\n');

    return lines.map((line, lIdx) => {
      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || /^\d+\./.test(line.trim());
      const parts = line.split(/(!\[.*?\]\([^\s\)]+\)|\[.*?\]\([^\s\)]+\)|https?:\/\/[^\s\)]+|\*\*.*?\*\*)/g);

      const formattedLine = parts.map((part, pIdx) => {
        // Markdown image ![alt](url)
        const mdImgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (mdImgMatch) {
          const [, alt, url] = mdImgMatch;
          return (
            <div key={pIdx} className="modern-chat-image-card">
              <img src={url} alt={alt || 'Photo'} className="modern-chat-img" />
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

        // Bold text **text** (rendered in Royal Blue)
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
    <div className="admin-ai-modern-root">
      {/* FLOATING TRIGGER BUTTON */}
      {!isOpen && (
        <div className="modern-launcher-wrapper">
          {showWelcomeTooltip && (
            <div className="modern-launcher-tooltip" onClick={() => setIsOpen(true)}>
              <span className="tooltip-sparkle">✨</span>
              <span>Ask Admin AI: Students, Faculty, Attendance, Analytics!</span>
              <button
                className="tooltip-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWelcomeTooltip(false);
                }}
              >
                ✕
              </button>
            </div>
          )}

          <button
            className="modern-ai-trigger"
            onClick={() => {
              setIsOpen(true);
              setShowWelcomeTooltip(false);
            }}
            title="Open Admin AI Assistant"
            aria-label="Open Admin AI Assistant"
          >
            <div className="trigger-aura-glow"></div>
            <div className="trigger-icon-orb">
              <FaRobot />
            </div>
            <div className="trigger-content">
              <span className="trigger-title">Admin AI</span>
              <span className="trigger-sub">Institution Co-Pilot</span>
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
                  <h3>Admin AI</h3>
                  <span className="ai-version-tag">Super Admin</span>
                </div>
                <div className="status-row">
                  <span className="live-pulse-dot"></span>
                  <span className="status-text">Connected to Student & Faculty DB</span>
                </div>
              </div>
            </div>

            <div className="header-actions">
              {/* Voice Mode Toggle Button */}
              <button
                className={`ai-header-btn ai-voice-toggle-btn ${isVoiceMode ? 'is-voice-on' : ''}`}
                onClick={toggleVoiceMode}
                title={isVoiceMode ? 'Voice Answers: ON (AI will speak answers aloud)' : 'Voice Answers: OFF (Text only responses)'}
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
                  {msg.sender === 'user' ? <FaUserShield /> : <FaRobot />}
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
                  <span className="thinking-text">Querying Student & Faculty Database...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* FLOATING MODERN INPUT CONTAINER WITH MICROPHONE & REFRESH */}
          <footer className="modern-input-wrapper">
            {voiceNotice && (
              <div className="voice-listening-banner">
                <span className="pulse-mic-dot"></span>
                <span>{voiceNotice}</span>
              </div>
            )}

            {/* Attached File Preview Floating Card */}
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

              {/* 📎 Attach File Button */}
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
                placeholder={isListening ? "Listening... Speak your query" : attachedFile ? "Ask anything about the attached file..." : "Ask AdminAI or attach a file (PDF, CSV, Excel...)"}
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
                  title={isListening ? "Listening... Click to stop" : "Speak your query (Microphone)"}
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
              <span>{isVoiceMode ? '🔊 Voice Mode ON (AI speaks responses)' : '🔇 Text Only Mode'} • Press <strong>Enter ↵</strong> to send</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

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
  FaExternalLinkAlt,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaStop,
  FaPaperclip
} from 'react-icons/fa';
import './StudentAiChat.css';

const CATEGORIES = [
  { id: 'all', label: '✨ All Smart Prompts', icon: <FaLightbulb /> },
  { id: 'attendance', label: '📊 Attendance & Margin', icon: <FaCalendarCheck /> },
  { id: 'academics', label: '🎓 Marks & Grades', icon: <FaGraduationCap /> },
  { id: 'regulations', label: '📜 College Rules', icon: <FaBookOpen /> },
  { id: 'assignments', label: '📝 Tasks & Deadlines', icon: <FaFileAlt /> },
];

const ALL_QUICK_CHIPS = [
  { cat: 'attendance', label: '📊 Attendance Percentage', query: 'What is my attendance percentage?' },
  { cat: 'attendance', label: '🔮 30-Day Forecast & Velocity', query: 'What is my 30-day attendance forecast and velocity trajectory?' },
  { cat: 'attendance', label: '💡 How to Improve Attendance & CGPA', query: 'How can I improve my attendance percentage and CGPA?' },
  { cat: 'academics', label: '📝 Generate Practice Questions from Syllabus', query: 'Generate quick practice quiz questions based on my syllabus with answer keys and explanations' },
  { cat: 'attendance', label: '📅 Today\'s Attendance', query: 'What is my attendance status for today?' },
  { cat: 'attendance', label: '🗓️ Yesterday\'s Attendance', query: 'What was my attendance yesterday?' },
  { cat: 'attendance', label: '💡 Safe Classes Margin', query: 'How many classes can I safely miss?' },
  { cat: 'attendance', label: '🚨 Classes Needed for 75%', query: 'How many classes do I need to attend to reach 75% attendance?' },
  { cat: 'regulations', label: '📜 Condonation & Shortage Rules', query: 'What are the college rules for attendance shortage and condonation?' },
  { cat: 'academics', label: '📝 Subject-wise Marks & Grades', query: 'Show my course marks and grades breakdown' },
  { cat: 'academics', label: '⚖️ Exam Weightage & Pass Marks', query: 'What is the internal vs semester exam weightage and passing minimum?' },
  { cat: 'regulations', label: '🎯 Grading Scale & CGPA Formula', query: 'Explain the 10-point letter grading scale and CGPA formula' },
  { cat: 'assignments', label: '⏳ Pending Coursework', query: 'What assignments are currently pending?' },
  { cat: 'all', label: '🖼️ Profile Photo', query: 'Show my profile photo' },
  { cat: 'all', label: '👤 Complete Student Profile', query: 'Show my complete student profile and CGPA' },
  { cat: 'all', label: '🔗 Coding & Social Handles', query: 'Show my GitHub, LinkedIn, and LeetCode links' }
];

const INITIAL_MESSAGE = {
  id: 'init-msg',
  sender: 'ai',
  text: `👋 **Welcome to Student AI!**\n\nI am your **AI Academic Co-Pilot**, connected in real-time to your Student Portal. Ask me about your **attendance**, **CGPA**, **assignments**, or **attach your syllabus (PDF, Word, TXT)** using the paperclip icon 📎 to generate instant practice exam questions!`,
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
    .replace(/[-•]/g, ' ') // bullet points to pauses
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emojis
    .replace(/\s+/g, ' ')
    .trim();
}

export default function StudentAiChat() {
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
    localStorage.getItem('student_ai_voice_mode') === 'true'
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
    localStorage.setItem('student_ai_voice_mode', String(nextVal));

    if (!nextVal && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  };

/**
 * Dedicated selector to find the highest-quality female voice
 */
function getFemaleVoice(voices) {
  if (!voices || voices.length === 0) return null;

  const femaleKeywords = [
    'natural (female)',
    'aria',
    'jenny',
    'zira',
    'samantha',
    'victoria',
    'karen',
    'moira',
    'tessa',
    'susan',
    'hazel',
    'heera',
    'veena',
    'neerja',
    'google uk english female',
    'google us english female',
    'female'
  ];

  // 1. Search for preferred English female voices
  for (const kw of femaleKeywords) {
    const match = voices.find(
      (v) => v.lang.startsWith('en') && v.name.toLowerCase().includes(kw)
    );
    if (match) return match;
  }

  // 2. Fallback: Any English voice that does NOT contain male names
  const maleNames = ['david', 'george', 'mark', 'richard', 'james', 'male', 'guy', 'ravi', 'stefan'];
  const nonMale = voices.find(
    (v) => v.lang.startsWith('en') && !maleNames.some((m) => v.name.toLowerCase().includes(m))
  );
  if (nonMale) return nonMale;

  return voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
}

  // Text-To-Speech function with natural Female Voice
  const speakMessage = (text, id) => {
    if (!('speechSynthesis' in window)) {
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
    utterance.pitch = 1.06; // Pleasant, natural female pitch

    // Set dedicated female voice
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
        setVoiceNotice('🎙️ Listening... Speak your question now');
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

        // AUTO-SEND if speech was captured
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
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      const res = await api.studentAiChat(textToSend.trim() || `Analyse this file: ${fileToSend?.name}`, fileToSend);
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

      // If voice mode is active, auto-speak the answer
      if (isVoiceMode) {
        setTimeout(() => speakMessage(aiReply, aiMsgId), 300);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Connection Error:** ${err.message || 'Unable to connect to the AI engine. Please verify your server connection.'}`,
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

  // Rich message formatting with modern markdown, code blocks, images, links & bold text
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
    <div className="student-ai-modern-root">
      {/* FLOATING TRIGGER LAUNCHER */}
      {!isOpen && (
        <div className="modern-launcher-wrapper">
          {showWelcomeTooltip && (
            <div className="modern-launcher-tooltip" onClick={() => setIsOpen(true)}>
              <span className="tooltip-sparkle">✨</span>
              <span>Ask Student AI by text or voice!</span>
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
            onClick={() => setIsOpen(true)}
            aria-label="Open Student AI Assistant"
          >
            <div className="trigger-aura-glow"></div>
            <div className="trigger-icon-orb">
              <FaRobot />
            </div>
            <div className="trigger-content">
              <span className="trigger-title">Student AI</span>
              <span className="trigger-sub">Voice & Chat Assistant</span>
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
                  <h3>Student AI</h3>
                  <span className="ai-version-tag">Pro</span>
                </div>
                <div className="status-row">
                  <span className="live-pulse-dot"></span>
                  <span className="status-text">Connected to Student Portal</span>
                </div>
              </div>
            </div>

            <div className="header-actions">
              {/* Voice Mode Toggle Button (Voice vs Text-Only) */}
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
                        <span>Referenced Institutional Documents:</span>
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
                  <span className="thinking-text">Analyzing your Student Portal records...</span>
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
                placeholder={isListening ? "Listening... Speak your question" : attachedFile ? "Ask anything about the attached file..." : "Ask StudentAI or attach a file (PDF, CSV, Excel...)"}
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
              <span>{isVoiceMode ? '🔊 Voice Mode ON (AI speaks responses)' : '🔇 Text Only Mode'} • Press <strong>Enter ↵</strong> to send</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

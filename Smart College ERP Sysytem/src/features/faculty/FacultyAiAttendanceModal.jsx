import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../auth/api';
import './FacultyAiAttendanceModal.css';

export default function FacultyAiAttendanceModal({
  isOpen,
  onClose,
  courseId,
  courseName,
  students = [],
  onApplyAttendance
}) {
  const [mode, setMode] = useState('photo'); // 'photo' | 'voice'
  const [photoSource, setPhotoSource] = useState('camera'); // 'camera' | 'upload'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoScanActive, setAutoScanActive] = useState(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const autoCloseTimerRef = useRef(null);

  // Initialize or cleanup camera stream
  useEffect(() => {
    if (isOpen && mode === 'photo' && photoSource === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [isOpen, mode, photoSource]);

  async function startCamera() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      console.warn('Camera access warning:', err);
      setErrorMsg('Camera access was denied or is unavailable. You can upload a photo instead.');
      setPhotoSource('upload');
      setIsCameraActive(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  // Live Hands-Free Face Auto-Detection Loop
  useEffect(() => {
    if (!isOpen || mode !== 'photo' || photoSource !== 'camera' || !isCameraActive || capturedImage || !autoScanActive || isProcessing) {
      return;
    }

    const interval = setInterval(async () => {
      if (!videoRef.current || isProcessing || capturedImage) return;
      if (videoRef.current.readyState < 2) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const probeDataUrl = canvas.toDataURL('image/jpeg', 0.75);

        const res = await api.facultyAiScanPhoto(courseId, probeDataUrl, 0.60);

        if (res.matches && res.matches.length > 0) {
          // Face recognized! Grab full frame and auto-mark present
          const hrCanvas = document.createElement('canvas');
          hrCanvas.width = videoRef.current.videoWidth || 1280;
          hrCanvas.height = videoRef.current.videoHeight || 720;
          hrCanvas.getContext('2d').drawImage(videoRef.current, 0, 0, hrCanvas.width, hrCanvas.height);
          const fullDataUrl = hrCanvas.toDataURL('image/jpeg', 0.85);

          setCapturedImage(fullDataUrl);
          setScanResult(res);

          const matchedIds = res.matches.map(m => m.studentId).filter(Boolean);
          const names = res.matches.map(m => m.name).filter(Boolean).slice(0, 3).join(', ');
          const label = names ? `${names}` : `${res.matches.length} student(s)`;

          setSuccessMsg(`🎉 Automatically Marked PRESENT: ${label}! Auto-closing...`);

          if (onApplyAttendance && matchedIds.length > 0) {
            onApplyAttendance(matchedIds);
          }

          if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
          autoCloseTimerRef.current = setTimeout(() => {
            onClose();
          }, 1800);
        }
      } catch (err) {
        // Silently continue auto-probe
      }
    }, 2800);

    return () => clearInterval(interval);
  }, [isOpen, mode, photoSource, isCameraActive, capturedImage, autoScanActive, isProcessing, courseId, onApplyAttendance, onClose]);

  function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    setScanResult(null);
    setSuccessMsg('');
    runAiPhotoScan(dataUrl);
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCapturedImage(dataUrl);
      setScanResult(null);
      setSuccessMsg('');
      runAiPhotoScan(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleFileDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCapturedImage(dataUrl);
      setScanResult(null);
      setSuccessMsg('');
      runAiPhotoScan(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function runAiPhotoScan(overrideImage) {
    const imgToScan = overrideImage || capturedImage;
    if (!imgToScan) return;
    setIsProcessing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.facultyAiScanPhoto(courseId, imgToScan, 0.60);
      setScanResult(res);
      if (res.matches && res.matches.length > 0) {
        const matchedIds = res.matches.map(m => m.studentId).filter(Boolean);
        const names = res.matches.map(m => m.name).filter(Boolean).slice(0, 3).join(', ');
        const label = names ? `${names}` : `${res.matches.length} student(s)`;

        setSuccessMsg(`🎉 Automatically Marked PRESENT: ${label}! Auto-closing...`);

        if (onApplyAttendance && matchedIds.length > 0) {
          onApplyAttendance(matchedIds);
        }

        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setErrorMsg('No enrolled student faces recognized in the photo. Please ensure face photos are registered in Profile.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'AI recognition failed. Ensure ml_service is running on port 8000.');
    } finally {
      setIsProcessing(false);
    }
  }

  // Voice recording handlers
  async function startVoiceRecording() {
    setErrorMsg('');
    setVoiceResult(null);
    setSuccessMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          setIsProcessing(true);
          try {
            const res = await api.facultyAiScanVoice(courseId, base64Audio, 0.55);
            setVoiceResult(res);
            if (res.matched && res.student) {
              const name = res.student.name || 'Student';
              setSuccessMsg(`✓ Voice Verified: ${name}! Marked PRESENT. Auto-closing...`);
              if (onApplyAttendance && res.student.studentId) {
                onApplyAttendance([res.student.studentId]);
              }
              if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
              autoCloseTimerRef.current = setTimeout(() => {
                onClose();
              }, 1800);
            } else {
              setErrorMsg('Voice signature did not match any enrolled student in this course.');
            }
          } catch (err) {
            setErrorMsg(err.message || 'Voice match failed');
          } finally {
            setIsProcessing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setErrorMsg('Microphone access denied: ' + err.message);
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title-group">
            <span className="ai-badge-chip">⚡ SnapClass AI Engine</span>
            <h3>AI Attendance Scanner</h3>
            <p className="ai-subtitle">Subject: <strong>{courseName || 'Selected Course'}</strong></p>
          </div>
          <button className="ai-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Mode Switcher */}
        <div className="ai-mode-tabs">
          <button
            className={`ai-tab-btn ${mode === 'photo' ? 'active' : ''}`}
            onClick={() => { setMode('photo'); setScanResult(null); }}
          >
            📸 Classroom Photo (Face AI)
          </button>
          <button
            className={`ai-tab-btn ${mode === 'voice' ? 'active' : ''}`}
            onClick={() => { setMode('voice'); setVoiceResult(null); }}
          >
            🎙️ Voice Roll-Call (Biometric)
          </button>
        </div>

        {errorMsg && (
          <div className="ai-alert-banner error">
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="ai-alert-banner success" style={{ margin: '14px 24px 0', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '10px 14px', borderRadius: '8px' }}>
            <span>🎉</span> {successMsg}
          </div>
        )}

        {/* Photo Mode */}
        {mode === 'photo' && (
          <div className="ai-photo-section">
            {/* Segmented Source Switcher */}
            <div className="ai-source-toggle">
              <button
                type="button"
                className={`ai-source-pill ${photoSource === 'camera' ? 'active' : ''}`}
                onClick={() => { setPhotoSource('camera'); setCapturedImage(null); }}
              >
                <span>📹 Live Camera</span>
                <span className="pill-badge live">HD ACTIVE</span>
              </button>
              <button
                type="button"
                className={`ai-source-pill ${photoSource === 'upload' ? 'active' : ''}`}
                onClick={() => { setPhotoSource('upload'); setCapturedImage(null); }}
              >
                <span>📁 Upload Photo</span>
                <span className="pill-badge upload">DROPZONE</span>
              </button>
            </div>

            {/* Viewport Box */}
            <div className="ai-viewport-card">
              {photoSource === 'camera' ? (
                <div className="ai-camera-feed">
                  {!capturedImage ? (
                    <>
                      <video
                        ref={(el) => {
                          videoRef.current = el;
                          if (el && streamRef.current && el.srcObject !== streamRef.current) {
                            el.srcObject = streamRef.current;
                            el.play().catch(() => {});
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="ai-video-stream"
                      />

                      {/* Sci-Fi HUD Reticle Overlays */}
                      <div className="ai-cam-corner top-left" />
                      <div className="ai-cam-corner top-right" />
                      <div className="ai-cam-corner bottom-left" />
                      <div className="ai-cam-corner bottom-right" />

                      {/* Live Badges */}
                      <div className="ai-cam-live-indicator">
                        <span className="pulse-dot" />
                        <span>LIVE CAMERA • 720P</span>
                      </div>
                      <div
                        className="ai-cam-tech-tag"
                        onClick={() => setAutoScanActive(prev => !prev)}
                        style={{ cursor: 'pointer' }}
                        title="Click to toggle hands-free auto-scan"
                      >
                        <span>⚡ {autoScanActive ? 'AUTO-SCAN ACTIVE' : 'MANUAL'}</span>
                      </div>

                      {/* Scanning Laser Line */}
                      <div className="ai-scan-laser-line" />

                      {/* Floating Bottom Shutter Bar */}
                      <div className="ai-camera-controls-bar">
                        <button
                          type="button"
                          className="ai-capture-shutter-btn"
                          onClick={capturePhoto}
                          title="Click to capture frame"
                        >
                          <span>📸</span>
                          <span>Capture Classroom Frame</span>
                        </button>
                        <span className="ai-camera-hint">
                          <span>💡</span> Aim at students in the classroom and click capture
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="ai-preview-box">
                      <div className="ai-preview-frame">
                        <img src={capturedImage} alt="Captured class" className="ai-preview-img" />
                        <div className="ai-preview-status-pill">
                          <span>✓</span> Frame Captured
                        </div>
                      </div>
                      <div className="ai-preview-actions-bar">
                        <button
                          type="button"
                          className="ai-btn-retake"
                          onClick={() => { setCapturedImage(null); setScanResult(null); }}
                        >
                          🔄 Retake Photo
                        </button>
                        <button
                          type="button"
                          className="ai-btn-scan-primary"
                          disabled={isProcessing}
                          onClick={runAiPhotoScan}
                        >
                          {isProcessing ? '⚡ Analyzing Faces...' : '🚀 Recognize & Mark Attendance'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ai-upload-section">
                  {!capturedImage ? (
                    <label
                      className={`ai-dropzone-modern ${isDragOver ? 'dragover' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleFileDrop}
                    >
                      <div className="ai-drop-icon-wrapper">
                        <span>🖼️</span>
                      </div>
                      <h4 className="ai-drop-title">
                        Drop classroom group photo here
                      </h4>
                      <p className="ai-drop-desc">
                        Drag & drop a classroom photo with student faces visible, or click browse to choose a file. Supports JPG, PNG & WEBP.
                      </p>
                      <div className="ai-drop-browse-btn">
                        <span>📁</span>
                        <span>Browse Files</span>
                      </div>
                      <input type="file" accept="image/*" onChange={handleFileUpload} hidden />
                    </label>
                  ) : (
                    <div className="ai-preview-box">
                      <div className="ai-preview-frame">
                        <img src={capturedImage} alt="Uploaded class" className="ai-preview-img" />
                        <div className="ai-preview-status-pill">
                          <span>✓</span> Photo Ready
                        </div>
                      </div>
                      <div className="ai-preview-actions-bar">
                        <button
                          type="button"
                          className="ai-btn-retake"
                          onClick={() => { setCapturedImage(null); setScanResult(null); }}
                        >
                          📁 Choose Another
                        </button>
                        <button
                          type="button"
                          className="ai-btn-scan-primary"
                          disabled={isProcessing}
                          onClick={runAiPhotoScan}
                        >
                          {isProcessing ? '⚡ Analyzing Faces...' : '🚀 Recognize & Mark Attendance'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI Results Breakdown */}
            {scanResult && (
              <div className="ai-results-panel">
                <div className="ai-results-summary">
                  <div className="ai-metric-card">
                    <span className="metric-val">{scanResult.facesDetected}</span>
                    <span className="metric-lbl">Faces Detected</span>
                  </div>
                  <div className="ai-metric-card highlight">
                    <span className="metric-val">{scanResult.matchedCount}</span>
                    <span className="metric-lbl">Students Recognized</span>
                  </div>
                  <div className="ai-metric-card">
                    <span className="metric-val">{scanResult.totalEnrolled}</span>
                    <span className="metric-lbl">Enrolled Students</span>
                  </div>
                </div>

                <div className="ai-matches-list">
                  <h5>Identified Students:</h5>
                  {scanResult.matches?.length > 0 ? (
                    <div className="ai-tags-row">
                      {scanResult.matches.map((m, idx) => (
                        <div key={idx} className="ai-student-tag">
                          <span className="tag-check">✓</span>
                          <strong>{m.name}</strong>
                          {m.rollNo && <span className="tag-roll">({m.rollNo})</span>}
                          <span className="tag-conf">{Math.round(m.confidence * 100)}% match</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-matches-msg">
                      No matching registered student faces found. Make sure students have enrolled their FaceID in their Student Profile.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Voice Mode */}
        {mode === 'voice' && (
          <div className="ai-voice-section">
            <div className="ai-voice-card">
              <span className="voice-mic-icon">{isRecording ? '🎙️🔴' : '🎙️'}</span>
              <h4>{isRecording ? 'Listening for Roll-Call...' : 'Voice Biometrics Scanner'}</h4>
              <p>
                {isRecording
                  ? 'Student should speak ("Present", "Yes Sir", or state their name).'
                  : 'Click start recording, have the student respond, and the AI will verify their vocal fingerprint.'}
              </p>

              <div className="ai-voice-btn-group">
                {!isRecording ? (
                  <button className="ai-action-btn primary" onClick={startVoiceRecording}>
                    🎙️ Start Listening
                  </button>
                ) : (
                  <button className="ai-action-btn danger" onClick={stopVoiceRecording}>
                    ⏹️ Stop & Verify Voice
                  </button>
                )}
              </div>

              {isProcessing && <div className="ai-spinner">AI Matching Voice Waves...</div>}

              {voiceResult && (
                <div className="ai-voice-result">
                  {voiceResult.matched && voiceResult.student ? (
                    <div className="voice-success-box">
                      <span className="success-icon">✅</span>
                      <div>
                        <h4>Identified: {voiceResult.student.name}</h4>
                        <p>Confidence: {Math.round(voiceResult.confidence * 100)}% Match • Marked PRESENT</p>
                      </div>
                    </div>
                  ) : (
                    <div className="voice-fail-box">
                      <span className="fail-icon">⚠️</span>
                      <p>Voice did not match any enrolled student in this class with high confidence.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="ai-modal-footer">
          <div className="ai-footer-left">
            <a
              href="http://localhost:5002"
              target="_blank"
              rel="noreferrer"
              className="ai-learn-link"
            >
              Explore SnapClass Journey ↗
            </a>
          </div>
          <button type="button" className="ai-done-btn" onClick={onClose} title="Complete and return to attendance dashboard">
            <span className="ai-done-check-icon">✓</span>
            <span>Done & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}

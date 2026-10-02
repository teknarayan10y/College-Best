import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../auth/api';
import '../faculty/FacultyAiAttendanceModal.css';

export default function AdminAiAttendanceModal({
  isOpen,
  onClose,
  initialTarget = 'student', // 'student' | 'faculty'
  onApplyAttendance
}) {
  const [target, setTarget] = useState(initialTarget); // 'student' | 'faculty'
  const [mode, setMode] = useState('photo'); // 'photo' | 'voice'
  const [photoSource, setPhotoSource] = useState('camera'); // 'camera' | 'upload'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoScanActive, setAutoScanActive] = useState(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const autoCloseTimerRef = useRef(null);

  // Sync initial target if modal reopens
  useEffect(() => {
    if (isOpen) {
      setTarget(initialTarget);
      setScanResult(null);
      setVoiceResult(null);
      setErrorMsg('');
      setSuccessMsg('');
    }
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [isOpen, initialTarget]);

  // Initialize or cleanup camera stream
  useEffect(() => {
    if (isOpen && mode === 'photo' && photoSource === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
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

        const res = await api.adminAiScanPhoto({
          target,
          image: probeDataUrl,
          threshold: 0.60
        });

        if (res.matches && res.matches.length > 0) {
          // Face recognized! Capture full frame and auto-mark present
          const hrCanvas = document.createElement('canvas');
          hrCanvas.width = videoRef.current.videoWidth || 1280;
          hrCanvas.height = videoRef.current.videoHeight || 720;
          hrCanvas.getContext('2d').drawImage(videoRef.current, 0, 0, hrCanvas.width, hrCanvas.height);
          const fullDataUrl = hrCanvas.toDataURL('image/jpeg', 0.85);

          setCapturedImage(fullDataUrl);
          setScanResult(res);

          const ids = res.matches.map(m => m.studentId || m.userId).filter(Boolean);
          const names = res.matches.map(m => m.name).filter(Boolean).slice(0, 3).join(', ');
          const label = names ? `${names}` : `${res.matches.length} ${target === 'student' ? 'students' : 'faculty'}`;

          setSuccessMsg(`🎉 Automatically Marked PRESENT: ${label}! Auto-closing...`);

          if (onApplyAttendance && ids.length > 0) {
            onApplyAttendance(ids, target);
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
  }, [isOpen, mode, photoSource, isCameraActive, capturedImage, autoScanActive, isProcessing, target, onApplyAttendance, onClose]);

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
    // Automatically trigger AI Recognition immediately
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
      const res = await api.adminAiScanPhoto({
        target,
        image: imgToScan,
        threshold: 0.60
      });
      setScanResult(res);
      if (res.matches && res.matches.length > 0) {
        const ids = res.matches.map(m => m.studentId || m.userId).filter(Boolean);
        const names = res.matches.map(m => m.name).filter(Boolean).slice(0, 3).join(', ');
        const label = names ? `${names}` : `${res.matches.length} ${target === 'student' ? 'students' : 'faculty members'}`;

        setSuccessMsg(`🎉 Automatically Marked PRESENT: ${label}! Auto-closing...`);

        if (onApplyAttendance && ids.length > 0) {
          onApplyAttendance(ids, target);
        }

        // Auto-close modal after 2 seconds - admin doesn't need to press Done!
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setErrorMsg(`No enrolled ${target} faces recognized in the photo. Please check enrolled biometrics.`);
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
            const res = await api.adminAiScanVoice({
              target,
              audio: base64Audio,
              threshold: 0.55
            });
            setVoiceResult(res);
            const person = res.person || res.student;
            if (res.matched && person) {
              const matchedId = person.userId || person.studentId || person._id;
              const name = person.name || 'Member';
              setSuccessMsg(`✓ Voice Verified: ${name}! Marked PRESENT. Auto-closing...`);
              if (onApplyAttendance && matchedId) {
                onApplyAttendance([matchedId], target);
              }
              // Auto-close modal after 2 seconds - admin doesn't need to press Done!
              if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
              autoCloseTimerRef.current = setTimeout(() => {
                onClose();
              }, 1800);
            } else {
              setErrorMsg(`Voice signature did not match any registered ${target}.`);
            }
          } catch (err) {
            setErrorMsg(err.message || 'Voice match failed. Ensure ml_service is running.');
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
            <span className="ai-badge-chip" style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)' }}>
              ADMIN AI ATTENDANCE
            </span>
            <h3>Dual AI Attendance (Students & Faculty)</h3>
            <p className="ai-subtitle">
              Scan high-resolution group photos or voice roll-calls to auto-mark attendance in bulk.
            </p>
          </div>
          <button className="ai-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Target Audience Switcher: Students vs Faculty */}
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#94a3b8' }}>Target Group:</span>
          <button
            type="button"
            onClick={() => { setTarget('student'); setScanResult(null); setVoiceResult(null); }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: target === 'student' ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
              background: target === 'student' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: target === 'student' ? '#60a5fa' : '#cbd5e1',
              fontWeight: target === 'student' ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🎓 Students
          </button>
          <button
            type="button"
            onClick={() => { setTarget('faculty'); setScanResult(null); setVoiceResult(null); }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: target === 'faculty' ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.1)',
              background: target === 'faculty' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              color: target === 'faculty' ? '#c084fc' : '#cbd5e1',
              fontWeight: target === 'faculty' ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👨‍🏫 Faculty Members
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="ai-mode-tabs">
          <button
            className={`ai-tab-btn ${mode === 'photo' ? 'active' : ''}`}
            onClick={() => setMode('photo')}
          >
            📸 Group Photo FaceID
          </button>
          <button
            className={`ai-tab-btn ${mode === 'voice' ? 'active' : ''}`}
            onClick={() => setMode('voice')}
          >
            🎙️ Voice Roll-Call
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="ai-alert-banner error" style={{ margin: '14px 24px 0' }}>
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="ai-alert-banner success" style={{ margin: '14px 24px 0', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '10px 14px', borderRadius: '8px' }}>
            <span>🎉</span> {successMsg}
          </div>
        )}

        {/* PHOTO MODE */}
        {mode === 'photo' && (
          <div className="ai-modal-body">
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
            <div className="ai-viewport-container">
              {photoSource === 'camera' ? (
                <div className="ai-camera-box">
                  {!capturedImage ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="ai-live-video"
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
                          <span>💡</span> Point camera at students or classroom crowd and click capture
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="ai-preview-box">
                      <div className="ai-preview-frame">
                        <img src={capturedImage} alt="Captured" className="ai-preview-img" />
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
                          onClick={runAiPhotoScan}
                          disabled={isProcessing}
                        >
                          {isProcessing ? '⚡ Analyzing Faces...' : `🚀 Identify & Mark ${target === 'student' ? 'Students' : 'Faculty'}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ai-upload-box">
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
                        Drag and drop your classroom image or click browse to upload. Supports high-res JPG, PNG & WEBP.
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
                        <img src={capturedImage} alt="Uploaded" className="ai-preview-img" />
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
                          onClick={runAiPhotoScan}
                          disabled={isProcessing}
                        >
                          {isProcessing ? '⚡ Analyzing Faces...' : `🚀 Identify & Mark ${target === 'student' ? 'Students' : 'Faculty'}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scan Results */}
            {scanResult && (
              <div className="ai-results-panel">
                <div className="ai-results-header">
                  <h4>
                    🎯 Identified {scanResult.matches?.length || 0} of {scanResult.facesDetected || 0} Faces
                  </h4>
                  <span className="ai-model-tag">ArcFace 128-d</span>
                </div>

                {scanResult.matches && scanResult.matches.length > 0 ? (
                  <div className="ai-matches-grid">
                    {scanResult.matches.map((match, idx) => (
                      <div key={idx} className="ai-match-card">
                        <div className="ai-match-avatar">
                          {match.name ? match.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="ai-match-info">
                          <span className="ai-match-name">{match.name}</span>
                          <span className="ai-match-roll">
                            {match.rollNo || match.facultyId || match.email || 'Verified'}
                          </span>
                          <span className="ai-confidence-pill">
                            {Math.round((match.confidence || 0.85) * 100)}% Match
                          </span>
                        </div>
                        <span className="ai-status-tag present">✓ PRESENT</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ai-no-match">
                    No enrolled {target} faces matched with high confidence.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* VOICE MODE */}
        {mode === 'voice' && (
          <div className="ai-modal-body">
            <div className="ai-voice-panel">
              <div className="ai-voice-icon-box">
                <span className={`ai-mic-icon ${isRecording ? 'recording' : ''}`}>
                  {isRecording ? '🔴' : '🎙️'}
                </span>
                <p className="ai-voice-prompt">
                  {isRecording
                    ? `Listening to ${target === 'student' ? 'student' : 'faculty member'} speaking... Click stop when finished.`
                    : `Have the ${target === 'student' ? 'student' : 'faculty member'} say their name or speak naturally to verify their voice biometric.`}
                </p>
              </div>

              <div className="ai-voice-controls">
                {!isRecording ? (
                  <button
                    className="ai-primary-btn"
                    onClick={startVoiceRecording}
                    disabled={isProcessing}
                  >
                    🎙️ Start Voice Verification
                  </button>
                ) : (
                  <button
                    className="ai-danger-btn"
                    onClick={stopVoiceRecording}
                  >
                    ⏹️ Stop & Verify Voice
                  </button>
                )}
              </div>

              {isProcessing && (
                <p style={{ textAlign: 'center', color: '#60a5fa', marginTop: '12px' }}>
                  ⏳ Analyzing acoustic spectrogram and embeddings...
                </p>
              )}

              {/* Voice Result */}
              {voiceResult && (
                <div className="ai-results-panel" style={{ marginTop: '20px' }}>
                  {voiceResult.matched && (voiceResult.person || voiceResult.student) ? (
                    <div className="ai-match-card success-card">
                      <div className="ai-match-avatar">
                        {(voiceResult.person || voiceResult.student).name?.charAt(0).toUpperCase() || '✓'}
                      </div>
                      <div className="ai-match-info">
                        <span className="ai-match-name">
                          {(voiceResult.person || voiceResult.student).name}
                        </span>
                        <span className="ai-match-roll">
                          {(voiceResult.person || voiceResult.student).rollNo ||
                           (voiceResult.person || voiceResult.student).facultyId ||
                           (voiceResult.person || voiceResult.student).email}
                        </span>
                        <span className="ai-confidence-pill">
                          {Math.round((voiceResult.confidence || 0.88) * 100)}% Acoustic Match
                        </span>
                      </div>
                      <span className="ai-status-tag present">✓ PRESENT</span>
                    </div>
                  ) : (
                    <p className="ai-no-match">
                      Voice signature not recognized. Please try again or re-enroll voice in Profile.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="ai-modal-footer">
          <div className="ai-footer-left">
            <span className="ai-system-badge">
              <span className="ai-system-badge-dot" />
              SnapClass AI Biometric Verification
            </span>
          </div>
          <button type="button" className="ai-done-btn" onClick={onClose} title="Complete and return to dashboard">
            <span className="ai-done-check-icon">✓</span>
            <span>Done & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../auth/api';
import { ensureModelsLoaded, faceDistance } from '../../hooks/useFaceApi';
import * as faceapi from '@vladmandic/face-api';
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
  const [modelsReady, setModelsReady] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLiveScanning, setIsLiveScanning] = useState(true);
  const [scanCooldown, setScanCooldown] = useState(false);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const autoCloseTimerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const cooldownRef = useRef(false);

  // Candidate roster with 128-d neural descriptors
  const enrolledCandidates = useMemo(() => {
    return (students || []).map(s => {
      const u = s?.user || {};
      const p = s?.profile || {};
      const id = String(u._id || s?.id || p?.user || '');
      const name = `${p.firstName || u.firstName || ''} ${p.lastName || u.lastName || ''}`.trim() || u.name || 'Student';
      const rollNo = p.rollNo || p.registerNumber || '';
      const descriptor = (Array.isArray(p.faceDescriptor) && p.faceDescriptor.length === 128)
        ? p.faceDescriptor
        : (Array.isArray(u.faceDescriptor) && u.faceDescriptor.length === 128)
          ? u.faceDescriptor
          : null;
      return { id, name, rollNo, descriptor };
    }).filter(c => c.id);
  }, [students]);

  // Pre-load deep neural network models on modal open
  useEffect(() => {
    if (isOpen) {
      ensureModelsLoaded().then(ok => {
        setModelsReady(ok);
        if (!ok) {
          console.warn('[FaceAI] Deep neural network models failed to load');
        }
      });
    }
  }, [isOpen]);

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
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
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

  // Core biometric comparison function
  const evaluateFaceDescriptor = useCallback((detectedDescriptor) => {
    const NEURAL_THRESHOLD = 0.48; // Strict Euclidean distance (<0.48 = same person; >=0.55 = different person)
    let bestCandidate = null;
    let minDistance = 999;

    for (const cand of enrolledCandidates) {
      if (!cand.descriptor) continue;
      const dist = faceDistance(detectedDescriptor, cand.descriptor);
      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = cand;
      }
    }

    if (bestCandidate && minDistance <= NEURAL_THRESHOLD) {
      const confidence = Math.max(0, Math.min(1, 1 - (minDistance / 0.65)));
      return {
        matched: true,
        candidate: bestCandidate,
        distance: minDistance.toFixed(3),
        confidence
      };
    } else {
      return {
        matched: false,
        bestDistance: minDistance < 900 ? minDistance.toFixed(3) : 'No descriptor',
        candidateName: bestCandidate ? bestCandidate.name : 'Unknown'
      };
    }
  }, [enrolledCandidates]);

  // Execute attendance action and update UI
  const applyAttendanceResult = useCallback((evaluation, frameDataUrl) => {
    setCapturedImage(frameDataUrl);

    if (evaluation.matched) {
      const cand = evaluation.candidate;
      setScanResult({
        facesDetected: 1,
        matchedCount: 1,
        totalEnrolled: enrolledCandidates.length,
        matches: [{
          studentId: cand.id,
          name: cand.name,
          rollNo: cand.rollNo,
          confidence: evaluation.confidence,
          distance: evaluation.distance
        }]
      });
      setSuccessMsg(`✓ Verified: ${cand.name} (${Math.round(evaluation.confidence * 100)}% match) — Marked PRESENT! Redirecting to Attendance Page...`);
      setErrorMsg('');

      if (onApplyAttendance) {
        onApplyAttendance({ presentIds: [cand.id] });
      }

      // Automatically return to attendance page after brief confirmation
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      // Face detected but does not match registered student face -> MARK ABSENT!
      const allStudentIds = enrolledCandidates.map(c => c.id);
      setScanResult({
        facesDetected: 1,
        matchedCount: 0,
        totalEnrolled: enrolledCandidates.length,
        matches: []
      });
      const distInfo = evaluation.bestDistance ? `(Distance: ${evaluation.bestDistance} > Threshold 0.48)` : '';
      setErrorMsg(`❌ Face Mismatch: Unrecognized face ${distInfo}. Marked ABSENT! Redirecting to Attendance Page...`);
      setSuccessMsg('');

      if (onApplyAttendance && allStudentIds.length > 0) {
        onApplyAttendance({ absentIds: allStudentIds });
      }

      // Automatically return to attendance page after brief confirmation
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        onClose();
      }, 1500);
    }
  }, [enrolledCandidates, onApplyAttendance, onClose]);

  // LIVE AUTOMATIC FACE SCANNER & AUTO-CAPTURE LOOP
  useEffect(() => {
    if (!isOpen || mode !== 'photo' || photoSource !== 'camera' || !isCameraActive || !isLiveScanning) {
      return;
    }

    let active = true;

    const autoScanInterval = setInterval(async () => {
      if (!active || isProcessingRef.current || cooldownRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      try {
        const ready = await ensureModelsLoaded();
        if (!ready || !active || isProcessingRef.current || cooldownRef.current) return;

        // Auto-detect face directly from live video feed
        const detection = await faceapi
          .detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.descriptor && active && !cooldownRef.current) {
          // FACE FOUND! AUTO-CAPTURE & EXECUTE NEURAL BIOMETRICS
          isProcessingRef.current = true;
          cooldownRef.current = true;
          setIsProcessing(true);
          setScanCooldown(true);

          // Auto-capture the video frame
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoRef.current, 0, 0, 640, 480);
          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.82);

          // Evaluate biometric face descriptor
          const detectedDesc = Array.from(detection.descriptor);
          const evaluation = evaluateFaceDescriptor(detectedDesc);

          applyAttendanceResult(evaluation, frameDataUrl);
          setIsProcessing(false);
          isProcessingRef.current = false;

          // 3-second cooldown to show the result clearly before resuming scan for the next student
          setTimeout(() => {
            if (active) {
              cooldownRef.current = false;
              setScanCooldown(false);
            }
          }, 3200);
        }
      } catch (err) {
        // Continue monitoring feed
      }
    }, 700);

    return () => {
      active = false;
      clearInterval(autoScanInterval);
    };
  }, [isOpen, mode, photoSource, isCameraActive, isLiveScanning, evaluateFaceDescriptor, applyAttendanceResult]);

  // Manual Capture button handler (alternative if user prefers click)
  async function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedImage(dataUrl);
    setScanResult(null);
    setSuccessMsg('');
    setErrorMsg('');
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
      setErrorMsg('');
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
      setErrorMsg('');
      runAiPhotoScan(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // Deep Neural Network Face Recognition Scan (for captured photo or file upload)
  async function runAiPhotoScan(overrideImage) {
    let imgToScan = overrideImage || capturedImage;
    if (!imgToScan) return;
    setIsProcessing(true);
    isProcessingRef.current = true;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const ok = await ensureModelsLoaded();
      if (!ok) throw new Error('Face recognition deep neural models could not be loaded.');

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for AI processing.'));
        img.src = imgToScan;
      });

      // Detect face using Deep Neural Network
      let detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.40 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setScanResult({
          facesDetected: 0,
          matchedCount: 0,
          totalEnrolled: enrolledCandidates.length,
          matches: []
        });
        setErrorMsg('No face detected in the image. Please position face clearly in good lighting.');
        setIsProcessing(false);
        isProcessingRef.current = false;
        return;
      }

      const evaluation = evaluateFaceDescriptor(Array.from(detection.descriptor));
      applyAttendanceResult(evaluation, imgToScan);
    } catch (err) {
      console.error('[FaceAI] Scan error:', err);
      setErrorMsg(err.message || 'Deep neural face recognition failed.');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }

  // Resume live scan for the next student
  function resumeLiveScan() {
    setCapturedImage(null);
    setScanResult(null);
    setErrorMsg('');
    setSuccessMsg('');
    cooldownRef.current = false;
    setScanCooldown(false);
    setIsLiveScanning(true);
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
              setSuccessMsg(`✓ Voice Verified: ${name}! Marked PRESENT.`);
              if (onApplyAttendance && res.student.studentId) {
                onApplyAttendance({ presentIds: [res.student.studentId] });
              }
            } else {
              setErrorMsg('Voice signature did not match any enrolled student. Marked ABSENT.');
              const allIds = enrolledCandidates.map(c => c.id);
              if (onApplyAttendance && allIds.length > 0) {
                onApplyAttendance({ absentIds: allIds });
              }
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
            <span className="ai-badge-chip">🧠 Deep Neural Network AI</span>
            <h3>AI Attendance Scanner (Auto-Capture)</h3>
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
            📷 Live Face Scanner (Auto-Capture)
          </button>
          <button
            className={`ai-tab-btn ${mode === 'voice' ? 'active' : ''}`}
            onClick={() => { setMode('voice'); setVoiceResult(null); }}
          >
            🎙️ Voice Roll-Call (Biometric)
          </button>
        </div>

        {errorMsg && (
          <div className="ai-alert-banner error" style={{ margin: '14px 24px 0', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid #ef4444', padding: '12px 16px', borderRadius: '10px' }}>
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="ai-alert-banner success" style={{ margin: '14px 24px 0', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '12px 16px', borderRadius: '10px' }}>
            <span>✅</span> {successMsg}
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
                <span>🎥 Auto-Capture Camera</span>
                <span className="pill-badge live">{modelsReady ? 'AUTO-CAPTURE ACTIVE' : 'LOADING AI...'}</span>
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
                        <span>{scanCooldown ? 'PROCESSING BIOMETRICS...' : 'AUTO-CAPTURE SCANNER ACTIVE'}</span>
                      </div>
                      <div className="ai-cam-tech-tag">
                        <span>⚡ NO CLICK NEEDED • AUTO-SCANS ON FACE</span>
                      </div>

                      {/* Scanning Laser Line */}
                      <div className="ai-scan-laser-line" />

                      {/* Floating Bottom Shutter Bar */}
                      <div className="ai-camera-controls-bar">
                        <button
                          type="button"
                          className="ai-capture-shutter-btn"
                          disabled={isProcessing}
                          onClick={capturePhoto}
                          title="Click for manual snapshot"
                        >
                          <span>📸</span>
                          <span>{isProcessing ? 'Verifying Neural Fingerprint...' : 'Manual Snapshot'}</span>
                        </button>
                        <span className="ai-camera-hint">
                          <span>👤</span> Stand in front of camera — AI auto-captures and marks Present if match, Absent if no match
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="ai-preview-box">
                      <div className="ai-preview-frame">
                        <img src={capturedImage} alt="Captured class" className="ai-preview-img" />
                        <div className="ai-preview-status-pill">
                          <span>📸</span> Face Captured & Analyzed
                        </div>
                      </div>
                      <div className="ai-preview-actions-bar">
                        <button
                          type="button"
                          className="ai-btn-scan-primary"
                          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                          onClick={resumeLiveScan}
                        >
                          ⚡ Scan Next Student (Resume Live Scanner)
                        </button>
                        <button
                          type="button"
                          className="ai-btn-retake"
                          onClick={() => { setCapturedImage(null); setScanResult(null); setErrorMsg(''); setSuccessMsg(''); }}
                        >
                          🔄 Retake
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
                        <span>📤</span>
                      </div>
                      <h4 className="ai-drop-title">
                        Drop student photo here
                      </h4>
                      <p className="ai-drop-desc">
                        Upload student photo to verify facial biometric fingerprint using Deep Neural Network.
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
                          <span>📸</span> Photo Ready
                        </div>
                      </div>
                      <div className="ai-preview-actions-bar">
                        <button
                          type="button"
                          className="ai-btn-retake"
                          onClick={() => { setCapturedImage(null); setScanResult(null); setErrorMsg(''); setSuccessMsg(''); }}
                        >
                          📁 Choose Another
                        </button>
                        <button
                          type="button"
                          className="ai-btn-scan-primary"
                          disabled={isProcessing}
                          onClick={() => runAiPhotoScan()}
                        >
                          {isProcessing ? '🧠 Neural Analysis...' : '🔍 Re-Verify Face'}
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
                  <div className={`ai-metric-card ${scanResult.matchedCount > 0 ? 'highlight' : ''}`}>
                    <span className="metric-val">{scanResult.matchedCount}</span>
                    <span className="metric-lbl">Students Recognized</span>
                  </div>
                  <div className="ai-metric-card">
                    <span className="metric-val">{scanResult.totalEnrolled}</span>
                    <span className="metric-lbl">Enrolled Students</span>
                  </div>
                </div>

                <div className="ai-matches-list">
                  <h5>Neural Recognition Result:</h5>
                  {scanResult.matches?.length > 0 ? (
                    <div className="ai-tags-row">
                      {scanResult.matches.map((m, idx) => (
                        <div key={idx} className="ai-student-tag" style={{ border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.15)' }}>
                          <span className="tag-check" style={{ color: '#10b981' }}>✓</span>
                          <strong>{m.name}</strong>
                          {m.rollNo && <span className="tag-roll">({m.rollNo})</span>}
                          <span className="tag-conf" style={{ color: '#34d399' }}>{Math.round(m.confidence * 100)}% match</span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '4px' }}>(dist: {m.distance}) — <strong>PRESENT</strong></span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.14)', border: '1px solid #ef4444', borderRadius: '10px', color: '#fca5a5', fontSize: '0.92rem' }}>
                      ❌ <strong>No Match / Face Rejected:</strong> Face does not match registered student biometrics. Student is marked <strong>ABSENT</strong>.
                    </div>
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

              {voiceResult && (
                <div className="ai-voice-results">
                  {voiceResult.matched ? (
                    <div className="voice-match-card success">
                      <span className="match-icon">✓</span>
                      <div>
                        <strong>{voiceResult.student?.name}</strong>
                        <p>Confidence: {Math.round((voiceResult.similarity || 0.85) * 100)}% • Marked Present</p>
                      </div>
                    </div>
                  ) : (
                    <div className="voice-match-card fail">
                      <span className="match-icon">✕</span>
                      <div>
                        <strong>No Voice Match</strong>
                        <p>Voice signature did not match enrolled student profiles. Marked Absent.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

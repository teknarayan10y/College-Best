import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../auth/api';

export default function StudentBiometricsSection({ profile, onUpdated }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setMsg({ text: '', type: '' });
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().then(() => setCameraReady(true)).catch(() => {});
        }
      }, 50);
    } catch (err) {
      setMsg({ text: 'Camera access denied or unavailable: ' + err.message, type: 'error' });
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
  }

  function captureFace() {
    if (!videoRef.current) return;
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      setMsg({ text: '⚠️ Camera is still warming up. Please wait for the video preview to display your face.', type: 'error' });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Brightness check to prevent saving pitch black or empty frames
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      let sum = 0;
      const step = 20;
      let samples = 0;
      for (let i = 0; i < d.length; i += 4 * step) {
        sum += (d[i] + d[i+1] + d[i+2]) / 3;
        samples++;
      }
      const avgBrightness = samples > 0 ? sum / samples : 0;
      if (avgBrightness < 15) {
        setMsg({
          text: '⚠️ Camera capture was pitch-black (avg brightness: ' + Math.round(avgBrightness) + '/255). Please ensure webcam shutter is open and room is lit, then try again.',
          type: 'error'
        });
        return;
      }
    } catch {
      // ignore security issues if any
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);
    stopCamera();
  }

  async function startVoiceRecord() {
    setMsg({ text: '', type: '' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudio(reader.result);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setMsg({ text: 'Microphone access denied: ' + err.message, type: 'error' });
    }
  }

  function stopVoiceRecord() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  const [savedFaceSuccess, setSavedFaceSuccess] = useState(false);

  async function handleSaveBiometrics() {
    if (!capturedPhoto) {
      setMsg({ text: '⚠️ Please click "Open Camera" and then "📸 Snap Face" (or upload a photo) first before saving.', type: 'error' });
      return;
    }
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.enrollBiometrics({
        image: capturedPhoto,
        audio: recordedAudio
      });
      setSavedFaceSuccess(true);
      setMsg({ text: '🎉 FaceID & Voice biometric fingerprint enrolled successfully into your profile!', type: 'success' });
      if (onUpdated) {
        onUpdated({
          ...res,
          biometricRegistered: true
        });
      }
    } catch (err) {
      setMsg({ text: err.message || 'Failed to enroll biometrics. Ensure ml_service is active.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const hasFace = (Array.isArray(profile?.faceEmbedding) && profile.faceEmbedding.length > 0 && profile.faceEmbedding.some(v => v !== 0)) || profile?.biometricRegistered || savedFaceSuccess;
  const hasVoice = (Array.isArray(profile?.voiceEmbedding) && profile.voiceEmbedding.length > 0) || Boolean(recordedAudio);

  return (
    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{
        padding: '16px 20px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(6, 182, 212, 0.12))',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <h3 style={{ margin: 0, color: '#fff' }}>SnapClass Biometric FaceID & Voice</h3>
          </div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            Enroll your FaceID for hands-free one-click instant login and AI Attendance verification.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 600,
            background: hasFace ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: hasFace ? '#34d399' : '#f87171',
            border: `1px solid ${hasFace ? '#10b981' : '#ef4444'}`
          }}>
            {hasFace ? '✓ FaceID Enrolled' : '✕ FaceID Missing'}
          </span>
          <span style={{
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 600,
            background: hasVoice ? 'rgba(16, 185, 129, 0.2)' : 'rgba(156, 163, 175, 0.2)',
            color: hasVoice ? '#34d399' : '#9ca3af',
            border: `1px solid ${hasVoice ? '#10b981' : '#6b7280'}`
          }}>
            {hasVoice ? '✓ Voice Enrolled' : 'Optional: Voice'}
          </span>
        </div>
      </div>

      {msg.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: msg.type === 'success' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${msg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          fontSize: '0.9rem'
        }}>
          {msg.text}
        </div>
      )}

      {/* Two-Column Enrollment Setup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* FaceID Card */}
        <div style={{
          background: '#0f172a',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px'
        }}>
          <h4 style={{ margin: 0, color: '#f1f5f9' }}>📸 Step 1: FaceID Photo</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Look directly into your camera in good lighting.
          </p>

          <div style={{
            width: '100%',
            maxWidth: '260px',
            height: '200px',
            background: '#020617',
            borderRadius: '12px',
            border: '2px dashed rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {cameraActive && !capturedPhoto && (
              <>
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                      el.play().then(() => setCameraReady(true)).catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedData={() => setCameraReady(true)}
                  onPlaying={() => setCameraReady(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {!cameraReady && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(2, 6, 23, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    gap: '6px'
                  }}>
                    <span>⏳ Initializing webcam...</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Align face once video appears</span>
                  </div>
                )}
              </>
            )}
            {capturedPhoto && (
              <img src={capturedPhoto} alt="Captured face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {!cameraActive && !capturedPhoto && (
              <span style={{ fontSize: '3rem', opacity: 0.4 }}>👤</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {!cameraActive && !capturedPhoto && (
              <>
                <button
                  type="button"
                  className="btn"
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={startCamera}
                >
                  Open Camera
                </button>
                <label style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  📁 Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          setCapturedPhoto(reader.result);
                          stopCamera();
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </>
            )}
            {cameraActive && !capturedPhoto && (
              <button
                type="button"
                className="btn"
                disabled={!cameraReady}
                style={{
                  background: cameraReady ? '#10b981' : '#334155',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: cameraReady ? 'pointer' : 'wait',
                  fontWeight: 600,
                  opacity: cameraReady ? 1 : 0.6
                }}
                onClick={captureFace}
              >
                {cameraReady ? '📸 Snap Face' : '⏳ Starting Camera...'}
              </button>
            )}
            {capturedPhoto && (
              <button
                type="button"
                className="btn"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => { setCapturedPhoto(null); startCamera(); }}
              >
                Retake
              </button>
            )}
          </div>
        </div>

        {/* VoiceID Card */}
        <div style={{
          background: '#0f172a',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px'
        }}>
          <h4 style={{ margin: 0, color: '#f1f5f9' }}>🎙️ Step 2: Voice Fingerprint (Optional)</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Record a short phrase like: <em>"I am present, my name is {profile?.firstName || 'Student'}."</em>
          </p>

          <div style={{
            width: '100%',
            maxWidth: '260px',
            height: '200px',
            background: '#020617',
            borderRadius: '12px',
            border: '2px dashed rgba(255, 255, 255, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '3rem' }}>{isRecording ? '🔴' : '🎙️'}</span>
            <span style={{ fontSize: '0.85rem', color: isRecording ? '#ef4444' : '#94a3b8' }}>
              {isRecording ? 'Recording audio...' : recordedAudio ? '✓ Audio sample ready' : 'Microphone idle'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {!isRecording ? (
              <button
                type="button"
                className="btn"
                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                onClick={startVoiceRecord}
              >
                {recordedAudio ? 'Re-record Voice' : 'Record Voice'}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                onClick={stopVoiceRecord}
              >
                ⏹️ Stop Recording
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
        <button
          type="button"
          disabled={loading || (!capturedPhoto && !recordedAudio)}
          onClick={handleSaveBiometrics}
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '12px 28px',
            borderRadius: '10px',
            border: 'none',
            cursor: loading || (!capturedPhoto && !recordedAudio) ? 'not-allowed' : 'pointer',
            opacity: loading || (!capturedPhoto && !recordedAudio) ? 0.5 : 1,
            boxShadow: '0 4px 16px rgba(79, 70, 229, 0.4)'
          }}
        >
          {loading ? '⚡ Generating AI Embeddings...' : '🚀 Save & Enroll Biometrics'}
        </button>
      </div>
    </div>
  );
}

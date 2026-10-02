// src/pages/Login.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../auth/api';
import { setToken, setUser } from '../auth/storage';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [faceErr, setFaceErr] = useState('');
  const [scanStatus, setScanStatus] = useState('Position face in frame to sign in');
  const [isVerifying, setIsVerifying] = useState(false);
  const [successUser, setSuccessUser] = useState(null);

  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const autoScanTimerRef = useRef(null);
  const isScanningRef = useRef(false);
  const isSuccessRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (showFaceModal) {
      isSuccessRef.current = false;
      isScanningRef.current = false;
      setSuccessUser(null);
      setFaceErr('');
      setScanStatus('Starting camera...');
      startFaceCamera();
    } else {
      stopAutoScanner();
      stopFaceCamera();
    }
    return () => {
      stopAutoScanner();
      stopFaceCamera();
    };
  }, [showFaceModal]);

  function stopAutoScanner() {
    if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
  }

  function startAutoScanner() {
    stopAutoScanner();
    setScanStatus('🟢 Live Scan Active: Looking for your face...');
    autoScanTimerRef.current = setInterval(async () => {
      if (isScanningRef.current || isSuccessRef.current) return;
      if (!faceVideoRef.current || faceVideoRef.current.readyState < 2 || faceVideoRef.current.videoWidth === 0) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = faceVideoRef.current.videoWidth || 640;
      canvas.height = faceVideoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(faceVideoRef.current, 0, 0, canvas.width, canvas.height);

      // Fast brightness verification
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        let sum = 0;
        const step = 25;
        let samples = 0;
        for (let i = 0; i < d.length; i += 4 * step) {
          sum += (d[i] + d[i+1] + d[i+2]) / 3;
          samples++;
        }
        const avgBrightness = samples > 0 ? sum / samples : 0;
        if (avgBrightness < 15) {
          setScanStatus('⚠️ Lighting is dark — please face light');
          return;
        }
      } catch {}

      isScanningRef.current = true;
      setIsVerifying(true);
      setScanStatus('⚡ Analyzing biometric face match...');

      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const res = await api.faceLogin(dataUrl, email.trim() || undefined);
        if (res?.token && res?.user) {
          isSuccessRef.current = true;
          stopAutoScanner();
          setSuccessUser(res.user);
          const userName = res.user.name || res.user.firstName || res.user.email || 'User';
          const roleDisplay = res.user.role ? (res.user.role.charAt(0).toUpperCase() + res.user.role.slice(1)) : 'User';
          setScanStatus(`🎉 Verified: ${userName} (${roleDisplay})! Logging in...`);
          setToken(res.token);
          setUser(res.user);
          sessionStorage.setItem('erp_welcome_msg', JSON.stringify({
            type: 'returning',
            name: userName
          }));
          setTimeout(() => {
            closeFaceModal();
            const fallbackPath = res.user.role === 'admin'
              ? '/admin/dashboard'
              : res.user.role === 'faculty'
              ? '/faculty/dashboard'
              : '/student/dashboard';
            const next = res?.redirectPath || fallbackPath;
            navigate(next, { replace: true });
          }, 700);
        }
      } catch {
        // Keep scanning seamlessly without jarring popups
        setScanStatus('🟢 Align face clearly inside the frame');
      } finally {
        if (!isSuccessRef.current) {
          isScanningRef.current = false;
          setIsVerifying(false);
        }
      }
    }, 1100);
  }

  async function startFaceCamera() {
    setFaceErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      faceStreamRef.current = stream;
      setTimeout(() => {
        if (faceVideoRef.current && faceStreamRef.current) {
          faceVideoRef.current.srcObject = faceStreamRef.current;
          faceVideoRef.current.play().then(() => {
            startAutoScanner();
          }).catch(() => {
            startAutoScanner();
          });
        }
      }, 60);
    } catch (e) {
      setFaceErr('Could not access camera: ' + e.message);
      setScanStatus('Camera unavailable');
    }
  }

  function stopFaceCamera() {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach(t => t.stop());
      faceStreamRef.current = null;
    }
  }

  function closeFaceModal() {
    stopAutoScanner();
    stopFaceCamera();
    setShowFaceModal(false);
  }

  async function handleFaceScan() {
    if (!faceVideoRef.current || isScanningRef.current || isSuccessRef.current) return;
    if (faceVideoRef.current.readyState < 2 || faceVideoRef.current.videoWidth === 0) {
      setFaceErr('Camera is still loading. Please wait a moment.');
      return;
    }
    setFaceErr('');
    setBusy(true);
    setIsVerifying(true);
    setScanStatus('⚡ Verifying face match...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = faceVideoRef.current.videoWidth || 640;
      canvas.height = faceVideoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(faceVideoRef.current, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const res = await api.faceLogin(dataUrl, email.trim() || undefined);
      if (res?.token && res?.user) {
        isSuccessRef.current = true;
        stopAutoScanner();
        setSuccessUser(res.user);
        const userName = res.user.name || res.user.firstName || res.user.email || 'User';
        const roleDisplay = res.user.role ? (res.user.role.charAt(0).toUpperCase() + res.user.role.slice(1)) : 'User';
        setScanStatus(`🎉 Verified: ${userName} (${roleDisplay})! Logging in...`);
        setToken(res.token);
        setUser(res.user);
        sessionStorage.setItem('erp_welcome_msg', JSON.stringify({
          type: 'returning',
          name: userName
        }));
        setTimeout(() => {
          closeFaceModal();
          const fallbackPath = res.user.role === 'admin'
            ? '/admin/dashboard'
            : res.user.role === 'faculty'
            ? '/faculty/dashboard'
            : '/student/dashboard';
          const next = res?.redirectPath || fallbackPath;
          navigate(next, { replace: true });
        }, 700);
      }
    } catch (e) {
      setFaceErr(e.message || 'Face not recognized. Please align face clearly or enter your email.');
      setScanStatus('Face not recognized — please retry');
    } finally {
      setBusy(false);
      setIsVerifying(false);
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!email || !password) {
      setErr('Please enter email and password.');
      return;
    }
    try {
      setBusy(true);
      const res = await api.login({ email, password });
      if (res?.token) setToken(res.token);
      if (res?.user) setUser(res.user);
      const userName = res.user?.name || res.user?.firstName || res.user?.email || 'User';
      sessionStorage.setItem('erp_welcome_msg', JSON.stringify({
        type: 'returning',
        name: userName
      }));
      const fallbackPath = res.user?.role === 'admin'
        ? '/admin/dashboard'
        : res.user?.role === 'faculty'
        ? '/faculty/dashboard'
        : '/student/dashboard';
      const next = res?.redirectPath || fallbackPath;
      navigate(next, { replace: true });
    } catch (e) {
      setErr(e.message || 'Invalid credentials. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <header className="auth-header">
          <h1>Welcome back</h1>
          <p>Sign in to your account</p>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <div className="input-group">
              <input
                className="input"
                type="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-group">
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle"
                onClick={() => setShowPwd(s => !s)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <div className="row">
            <label className="help">
              <input type="checkbox" style={{ marginRight: 6 }} /> Remember me
            </label>
            <a className="help" href="#">Forgot password?</a>
          </div>

          {err && <div className="form-error">{err}</div>}
          <button className="btn submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0',
            color: '#6b7280',
            fontSize: '0.85rem'
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ padding: '0 10px' }}>OR BIOMETRIC</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <button
            type="button"
            className="btn"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
              color: '#fff',
              fontWeight: 600,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
            }}
            onClick={() => { setShowFaceModal(true); setFaceErr(''); }}
          >
            ⚡ Sign In with FaceID
          </button>
        </form>

        <footer className="auth-footer">
          <span>New here?</span>
          <Link to="/signup" className="link">Create an account</Link>
        </footer>
      </div>

      {/* FaceID Login Modal */}
      {showFaceModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '440px',
            width: '100%',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <h3 style={{ margin: 0, color: '#f8fafc' }}>SnapClass FaceID Login</h3>
            </div>
            
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Look directly into the camera. Face recognition will sign you in <strong>automatically</strong>.
            </p>

            {/* Live Scanner Status Badge */}
            <div style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              background: successUser
                ? 'rgba(16, 185, 129, 0.2)'
                : isVerifying
                ? 'rgba(99, 102, 241, 0.2)'
                : 'rgba(6, 182, 212, 0.12)',
              border: `1px solid ${
                successUser
                  ? '#10b981'
                  : isVerifying
                  ? '#6366f1'
                  : 'rgba(6, 182, 212, 0.35)'
              }`,
              color: successUser ? '#34d399' : isVerifying ? '#a5b4fc' : '#67e8f9',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}>
              <span>{successUser ? '✓' : isVerifying ? '⚡' : '👁️'}</span>
              <span>{scanStatus}</span>
            </div>

            {faceErr && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                width: '100%'
              }}>
                {faceErr}
              </div>
            )}

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                Your Registered Email (Optional — for direct 1-to-1 account verification):
              </label>
              <input
                type="email"
                placeholder="e.g. student@college.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Camera Viewfinder with Apple-style Reticle and Laser Sweep */}
            <div style={{
              width: '100%',
              height: '240px',
              background: '#020617',
              borderRadius: '14px',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <video
                ref={(el) => {
                  faceVideoRef.current = el;
                  if (el && faceStreamRef.current && el.srcObject !== faceStreamRef.current) {
                    el.srcObject = faceStreamRef.current;
                    el.play().then(() => startAutoScanner()).catch(() => startAutoScanner());
                  }
                }}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />

              {/* Scanning Corner Brackets */}
              <div style={{
                position: 'absolute',
                width: '160px',
                height: '180px',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                border: successUser ? '3px solid #10b981' : '2px dashed rgba(6, 182, 212, 0.65)',
                borderRadius: '24px',
                boxShadow: successUser ? '0 0 24px rgba(16, 185, 129, 0.5)' : '0 0 16px rgba(6, 182, 212, 0.2)',
                transition: 'all 0.3s ease'
              }} />

              {/* Animated Sweep Line */}
              {!successUser && (
                <div style={{
                  position: 'absolute',
                  left: '10%',
                  right: '10%',
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, #06b6d4, #3b82f6, transparent)',
                  boxShadow: '0 0 12px #06b6d4',
                  animation: 'sweepLaser 2.2s infinite ease-in-out'
                }} />
              )}

              {/* Success Overlay */}
              {successUser && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(16, 185, 129, 0.3)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '3rem' }}>✓</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Face Recognized!</span>
                  <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>Redirecting...</span>
                </div>
              )}
            </div>

            <style>{`
              @keyframes sweepLaser {
                0% { top: 15%; opacity: 0.3; }
                50% { top: 85%; opacity: 1; }
                100% { top: 15%; opacity: 0.3; }
              }
            `}</style>

            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '11px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
                onClick={closeFaceModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || Boolean(successUser)}
                style={{
                  flex: 2,
                  background: successUser
                    ? '#10b981'
                    : 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  padding: '11px',
                  borderRadius: '10px',
                  cursor: (busy || successUser) ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(79, 70, 229, 0.4)'
                }}
                onClick={handleFaceScan}
              >
                {successUser ? '✓ Authenticated' : isVerifying ? '⚡ Verifying...' : '📸 Instant Verify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
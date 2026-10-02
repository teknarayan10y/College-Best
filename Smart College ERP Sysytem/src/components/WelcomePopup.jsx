// src/components/WelcomePopup.jsx
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './WelcomePopup.css';

export default function WelcomePopup() {
  const [data, setData] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // 1. Check sessionStorage first
    try {
      const stored = sessionStorage.getItem('erp_welcome_msg');
      if (stored) {
        sessionStorage.removeItem('erp_welcome_msg');
        setData(JSON.parse(stored));
        return;
      }
    } catch (e) {
      console.warn('WelcomePopup parse error:', e);
    }

    // 2. Check location state fallback
    if (location.state?.welcomeMsg) {
      setData(location.state.welcomeMsg);
    }
  }, [location.state]);

  // Automatically disappears within 2 seconds
  useEffect(() => {
    if (!data) return;

    // Start fade out at 1.7s
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 1700);

    // Remove from DOM at 2.0s
    const removeTimer = setTimeout(() => {
      setData(null);
      setIsFading(false);
    }, 2000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [data]);

  if (!data) return null;

  const isNew = data.type === 'new';
  const name = data.name || (isNew ? 'Student' : 'User');

  return (
    <div className={`welcome-header-toast ${isNew ? 'new-user' : 'returning-user'} ${isFading ? 'toast-fade-out' : ''}`}>
      <span className="toast-icon">{isNew ? '🎉' : '👋'}</span>
      <span className="toast-text">
        {isNew
          ? `Your account is created! Welcome, ${name}`
          : `Welcome back, ${name}!`}
      </span>
    </div>
  );
}

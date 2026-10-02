// src/pages/Signup.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../auth/api';
import { setToken, setUser } from '../auth/storage';
import './signup.css';

export default function Signup() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setOk('');
    if (!name || !email || !password) {
      setErr('Please fill all required fields.');
      return;
    }
    try {
      setBusy(true);
      const normalizedRole = (role || '').toLowerCase();
      const res = await api.signup({ name, email, password, role: normalizedRole });
      if (res?.token) setToken(res.token);
      if (res?.user) setUser(res.user);
      const next = res?.redirectPath
        || (normalizedRole === 'student' ? '/student/dashboard'
        : normalizedRole === 'faculty' ? '/faculty/dashboard'
        : '/admin/dashboard');
      sessionStorage.setItem('erp_welcome_msg', JSON.stringify({
        type: 'new',
        name: res?.user?.name || name || 'Student'
      }));
      setOk('Account created successfully.');
      setTimeout(() => navigate(next, { replace: true }), 400);
    } catch (e) {
      setErr(e.message || 'Signup failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <header className="auth-header">
          <h1>Create account</h1>
          <p>Join the Smart College ERP</p>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Full name</span>
            <input
              className="input"
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="field">
            <span>Role</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>
          </label>

          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              placeholder="you@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {err && <div className="form-error">{err}</div>}
          {ok && <div className="form-ok">{ok}</div>}

          <button className="btn submit" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <footer className="auth-footer">
          <span>Already have an account?</span>
          <Link to="/login" className="link">Sign in</Link>
        </footer>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../auth/api';
import './CreateDepartment.css';
export default function CreateDepartment() {
  const [form, setForm] = useState({ code: '', name: '', description: '', isActive: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.adminCreateDepartment(form);
      navigate('/admin/departments');
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (


<div className="admin-dark create-department">
  <header className="page-header"><h2></h2></header>

  <div className="card">
    <div className="section"><h3>Basic details</h3></div>

    <form className="form" onSubmit={onSubmit}>
      {error && <div className="alert error">{error}</div>}

      <label className="label">
        <span>Code</span>
        <div className="input-group">
          <span className="leading">🏷️</span>
          <input
            className="input"
            value={form.code}
            onChange={e=>setForm({...form, code:e.target.value})}
            required
          />
        </div>
        <div className="hint">Unique code (e.g., CSE, ECE)</div>
      </label>

      <label className="label">
        <span>Name</span>
        <div className="input-group">
          <span className="leading">🏢</span>
          <input
            className="input"
            value={form.name}
            onChange={e=>setForm({...form, name:e.target.value})}
            required
          />
        </div>
      </label>

      <label className="label full">
        <span>Description</span>
        <textarea
          className="input"
          rows={4}
          value={form.description}
          onChange={e=>setForm({...form, description:e.target.value})}
        />
      </label>

      <div className="full">
        <label className="switch">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e=>setForm({...form, isActive:e.target.checked})}
          />
          <span className="track"><span className="thumb" /></span>
          <span className="label">Active</span>
        </label>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Department'}
        </button>
      </div>
    </form>
  </div>
</div>

  );
}
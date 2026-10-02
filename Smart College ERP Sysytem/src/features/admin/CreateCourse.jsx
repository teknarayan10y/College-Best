// src/features/admin/CreateCourse.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "./CreateCourse.css";
import { api } from '../../auth/api';

function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export default function CreateCourse() {
  const [form, setForm] = useState({
    code: '',
    name: '',
    department: '',
    section: '',
    credits: '',
    semester: 1,
    faculty: '',        // holds selected faculty userId
    description: '',
    isActive: true,
  });
  const [facultyOptions, setFacultyOptions] = useState([]);
  const [loadingFaculty, setLoadingFaculty] = useState(true);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingFaculty(true);
        const res = await api.adminFaculty({ limit: 500 });
        const arr = Array.isArray(res?.faculty) ? res.faculty : Array.isArray(res) ? res : [];
        const options = arr.map((f) => {
          const id = f.userId || f._id;
          const name = f.name || `${f.firstName || ''} ${f.lastName || ''}`.trim() || f.email || 'Unnamed';
          return {
            value: id,
            label: `${name} — ${id}`, // show name and full id
          };
        }).filter(o => o.value);
        if (!cancelled) setFacultyOptions(options);
      } catch {
        if (!cancelled) setFacultyOptions([]);
      } finally {
        if (!cancelled) setLoadingFaculty(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => {
      let v = type === 'checkbox' ? checked : value;
      if (name === 'code') v = String(v).toUpperCase().trim();
      if (name === 'credits') v = Math.max(0, toInt(v, 0));
      if (name === 'semester') v = Math.min(8, Math.max(1, toInt(v, 1)));
      return { ...f, [name]: v };
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        credits: toInt(form.credits, 0),
        semester: toInt(form.semester, 1),
        faculty: form.faculty || undefined, // allow unassigned
      };
      await api.adminCreateCourse(payload);
      setOk('Course created');
      navigate('/admin/courses', { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Failed to create course');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-dark create-course">
      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Create Course</h1>
            <p className="subtitle">Add a new course with department, credits, semester, and assigned faculty</p>
          </div>
        </div>

        {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}
        {ok && <div className="form-success" style={{ marginBottom: 12 }}>{ok}</div>}

        <form onSubmit={onSubmit} className="admin-form">
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Code<span className="req">*</span></span>
              <input
                name="code"
                value={form.code}
                onChange={onChange}
                required
                placeholder="CSE501"
              />
              <div className="hint">Auto-uppercase. Must be unique.</div>
            </label>

            <label className="admin-field">
              <span>Name<span className="req">*</span></span>
              <input
                name="name"
                value={form.name}
                onChange={onChange}
                required
                placeholder="Operating Systems"
              />
            </label>

            <label className="admin-field">
              <span>Department</span>
              <input
                name="department"
                value={form.department}
                onChange={onChange}
                placeholder="CSE"
              />
            </label>
            <label className="admin-field">
  <span>Section</span>
  <select name="section" value={form.section} onChange={onChange}>
    <option value="">None</option>
    <option value="A">A</option>
    <option value="B">B</option>
    <option value="C">C</option>
  </select>
</label>

            <label className="admin-field">
              <span>Credits</span>
              <input
                name="credits"
                value={form.credits}
                onChange={onChange}
                type="number"
                min="0"
                placeholder="4"
              />
            </label>

            <label className="admin-field">
              <span>Semester</span>
              <select name="semester" value={form.semester} onChange={onChange}>
                {[...Array(8)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>Semester {i + 1}</option>
                ))}
              </select>
              <div className="hint">Select 1–8.</div>
            </label>

            <label className="admin-field">
              <span>Faculty (assign by user)</span>
              <select
                name="faculty"
                value={form.faculty || ''}
                onChange={onChange}
                disabled={loadingFaculty}
              >
                <option value="">{loadingFaculty ? 'Loading…' : 'Unassigned'}</option>
                {facultyOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {form.faculty && <div className="hint">Selected Faculty ID: {form.faculty}</div>}
            </label>
          </div>

          <label className="admin-field" style={{ marginTop: 12 }}>
            <span>Description</span>
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              rows={4}
            />
          </label>

          <label className="admin-field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={onChange}
            />
            <span>Active</span>
          </label>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={submitting}>Create</button>
            <button className="btn ghost" type="button" onClick={() => navigate('/admin/courses')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../auth/api';
import './EditDepartment.css'; 

export default function EditDepartment() {
  const { departmentId } = useParams();
  const [form, setForm] = useState({ code: '', name: '', description: '', isActive: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await api.adminDepartmentById(departmentId);
        if (!cancel) setForm({
          code: res.item.code || '',
          name: res.item.name || '',
          description: res.item.description || '',
          isActive: !!res.item.isActive,
        });
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [departmentId]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.adminUpdateDepartment(departmentId, form);
      navigate('/admin/departments');
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this department?')) return;
    await api.adminDeleteDepartment(departmentId);
    navigate('/admin/departments');
  }


  if (loading) return <p>Loading...</p>;
// at top: import './EditDepartment.css' (already present)

// replace the return block with:
return (
  <div className="admin-dark edit-department">
    <header className="page-header"><h2>Edit Department</h2></header>

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
          <div className="hint">Changing code will fail if duplicate exists.</div>
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
          <div className="left">
            <button className="btn danger" type="button" onClick={onDelete} disabled={saving}>
              Delete
            </button>
          </div>
          <div className="right">
            <button className="btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
);
}
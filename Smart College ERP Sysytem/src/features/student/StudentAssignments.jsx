// src/features/student/StudentAssignments.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../auth/api';
import './StudentAssignments.css';

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const filesBase = apiBase.replace(/\/api$/i, '');
  const rel = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

function formatDate(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return ''; }
}

function computeStatus(dueDate) {
  if (!dueDate) return { label: 'No due date', key: 'none' };
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  if (isNaN(due)) return { label: 'No due date', key: 'none' };
  if (due < now) return { label: 'Overdue', key: 'overdue' };
  return { label: 'Due', key: 'due' };
}

export default function StudentAssignments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [semester, setSemester] = useState('');

  // Submission modal state
  const [submitFor, setSubmitFor] = useState(null); // assignment object
  const [submitFiles, setSubmitFiles] = useState([]);
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mySubs, setMySubs] = useState({}); // assignmentId -> submission

  const fetchData = useMemo(() => async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await api.studentAssignments(semester ? { semester } : {});
      setItems(res?.items || []);
    } catch (e) {
      setErr(e.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [semester]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadMySubmission(assignmentId) {
    try {
      const res = await api.studentMySubmission(assignmentId);
      setMySubs(prev => ({ ...prev, [assignmentId]: res?.item || null }));
    } catch {
      // ignore
    }
  }

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) setSubmitFiles(prev => [...prev, ...files]);
    e.target.value = '';
  }

  async function doSubmit() {
    if (!submitFor) return;
    setSubmitting(true);
    try {
      await api.studentSubmitAssignment(submitFor._id, { note: submitNote }, submitFiles);
      await loadMySubmission(submitFor._id);
      setSubmitFiles([]);
      setSubmitNote('');
      setSubmitFor(null);
    } catch (e) {
      alert(e.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Assignments</h1>
          <p className="meta">Browse assignments for your enrolled courses</p>
        </div>
        <div className="assignments-toolbar">
          <select value={semester} onChange={e => setSemester(e.target.value)}>
            <option value="">Current semester</option>
            <option value="all">All semesters</option>
            {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{`Semester ${s}`}</option>)}
          </select>
          <button className="btn" onClick={fetchData}>Refresh</button>
        </div>
      </header>

      {loading && (
        <div className="grid cards">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton card assignment" />)}
        </div>
      )}

      {err && <div className="error">{err}</div>}

      {!loading && !err && items.length === 0 && (
        <div className="empty-state">No assignments found.</div>
      )}

      {!loading && !err && items.length > 0 && (
        <div className="grid cards">
          {items.map(a => {
            const status = computeStatus(a.dueDate);
            const mySubmission = mySubs[a._id];
            return (
              <div key={a._id} className="card assignment">
                <div className="header-row">
                  <div>
                    <h3>{a.title}</h3>
                    <div className="meta">
                      {a.courseName || 'Course'} · By {a.facultyName || '-'}
                      {a.dueDate ? ` · Due ${formatDate(a.dueDate)}` : ''}
                    </div>
                  </div>
                  <div className="badges">
                    {status.key !== 'none' && (
                      <span className={`badge ${status.key}`}>{status.label}</span>
                    )}
                    {mySubmission && <span className="badge">Submitted</span>}
                  </div>
                </div>

                {a.description && <p style={{ marginTop: 10 }}>{a.description}</p>}

                {Array.isArray(a.files) && a.files.length > 0 && (
                  <div className="files">
                    {a.files.map((f, idx) => (
                      <a
                        key={idx}
                        className="file-chip"
                        href={toAbsoluteUploadUrl(f.url || f.path)}
                        target="_blank"
                        rel="noreferrer"
                        title={f.originalName || 'file'}
                      >
                        📎 {f.originalName || 'file'}
                      </a>
                    ))}
                  </div>
                )}

                <div className="actions">
                  <button className="btn ghost" onClick={() => window.open('#', '_self')} disabled>
                    View details
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => { setSubmitFor(a); loadMySubmission(a._id); }}
                  >
                    {mySubmission ? 'Edit submission' : 'Submit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {submitFor && (
        <div className="modal-overlay">
         <div className="modal">
  <header className="modal-header">
    <h3>Submit: {submitFor.title}</h3>
    <button className="close-btn" onClick={() => setSubmitFor(null)} aria-label="Close">✕</button>
  </header>
            <div className="modal-body">
              <div className="field">
                <label>Note (optional)</label>
                <textarea
                  value={submitNote}
                  onChange={e => setSubmitNote(e.target.value)}
                  rows={3}
                  placeholder="Add any notes for your submission"
                />
              </div>

              <div className="field">
                <label>Files</label>

                {/* Dropzone */}
                <label
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length) setSubmitFiles(prev => [...prev, ...files]);
                  }}
                >
                  <input
                    className="input-hidden"
                    type="file"
                    multiple
                    accept="
audio/*,video/*,application/pdf,
image/png,image/jpeg,image/jpg,image/webp,
text/plain,text/markdown
"
                    onChange={onPickFiles}
                  />
                  <strong>Click to upload or drag & drop files</strong>
                  <small>Audio, video, PDF, PNG/JPG/WEBP, TXT, MD (max 20 files, 1GB each)</small>
                </label>

                {/* Selected files */}
                {submitFiles.length > 0 && (
                  <div className="file-list">
                    {submitFiles.map((f, idx) => (
                      <span key={idx} className="file-pill" title={f.name}>
                        📎 {f.name}
                        <button
                          type="button"
                          className="remove"
                          onClick={() => setSubmitFiles(prev => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remove ${f.name}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {mySubs[submitFor._id] && (
                <div className="card" style={{ marginTop: 10 }}>
                  <strong>Existing submission:</strong>
                  <div className="meta">
                    Submitted at {formatDate(mySubs[submitFor._id].submittedAt)}
                  </div>
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button className="btn secondary" onClick={() => setSubmitFor(null)} disabled={submitting}>
                Cancel
              </button>
              <button className="btn primary" onClick={doSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
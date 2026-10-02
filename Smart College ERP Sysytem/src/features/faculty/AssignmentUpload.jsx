// src/features/faculty/AssignmentUpload.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import './AssignmentUpload.css';
// import '../student/StudentDashboard.css';
// import '../faculty/FacultyDashboard.css';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/api$/, '');

function getCourseId(c) {
  return (c && (c._id || c.id || c.courseId || (c.course && c.course._id))) || '';
}
function fileUrl(f) {
  return `${API_ORIGIN}${f.url || ''}`;
}
function absFileUrl(f) {
  return `${API_ORIGIN}${f?.url || f?.path || ''}`;
}
function openAssignment(a) {
  const first = (a.files || [])[0];
  if (first && first.url) window.open(fileUrl(first), '_blank', 'noopener,noreferrer');
}

export default function AssignmentUpload() {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [files, setFiles] = useState([]);

  const [courses, setCourses] = useState([]);
  const [studentsInCourse, setStudentsInCourse] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // NEW: submissions state
  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState('');
  const [selectedA, setSelectedA] = useState(null); // selected assignment

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const crs = await api.facultyCourses();
        const list = await api.facultyAssignmentsList();
        if (!mounted) return;
        const all = crs?.items || crs?.courses || [];
        setCourses(all);
        setAssignments(list?.items || []);
        if (!courseId && all.length) {
          const firstId = getCourseId(all[0]);
          if (firstId) setCourseId(firstId);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setStudentsInCourse([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoadingStudents(true);
        const r = await api.facultyCourseStudents(courseId);
        if (!mounted) return;
        setStudentsInCourse(Array.isArray(r?.items) ? r.items : (r?.students || []));
      } catch {
        setStudentsInCourse([]);
      } finally {
        if (mounted) setLoadingStudents(false);
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  async function refreshAssignments() {
    setLoadingAssignments(true);
    try {
      const r = await api.facultyAssignmentsList();
      setAssignments(Array.isArray(r?.items) ? r.items : []);
    } catch {
      setAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }

  function onPick(e) {
    const sel = Array.from(e.target.files || []);
    if (!sel.length) return;
    setFiles(prev => [...prev, ...sel]);
  }
  function removeFile(i) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const sel = Array.from(e.dataTransfer.files || []);
    if (sel.length) setFiles(prev => [...prev, ...sel]);
  }
  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave() { setDragOver(false); }

  function typeClass(f) {
    const mt = (f.type || '').toLowerCase();
    if (mt.startsWith('video/')) return 'chip-video';
    if (mt.startsWith('audio/')) return 'chip-audio';
    if (mt === 'application/pdf') return 'chip-pdf';
    if (mt.startsWith('image/')) return 'chip-image';
    if (mt.startsWith('text/')) return 'chip-text';
    return 'chip-file';
  }

  function displayName(p) {
    const u = p?.user || {};
    const prof = p?.profile || {};
    const first = prof.firstName || u.firstName || '';
    const last  = prof.lastName  || u.lastName  || '';
    const idLike = prof.registerNumber || prof.rollNo || '';
    return (first + ' ' + last).trim() || idLike || u.email || 'Unknown';
  }

  async function submit() {
    setErr(''); setMsg(''); setLoading(true);
    try {
      if (!title?.trim() || !courseId) throw new Error('Title and Course are required');
      const payload = { title: title.trim(), description, courseId, dueDate };
      await api.facultyAssignmentsCreate(payload, files);
      setMsg('Assignment uploaded successfully');
      setTitle(''); setDescription(''); setDueDate(''); setFiles([]);
      await refreshAssignments();
    } catch (e) {
      setErr(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const courseNameFromAssignment = useMemo(() => {
    const map = new Map((courses || []).map(c => [String(getCourseId(c)), c?.name]));
    return (a) => {
      const cid = String(a.courseId || a.course?._id || a.courseId?._id || '');
      return map.get(cid) || 'Course';
    };
  }, [courses]);

  // NEW: load submissions for an assignment
  async function loadSubs(assignmentId) {
    setSubsLoading(true);
    setSubsErr('');
    try {
      const res = await api.facultyAssignmentSubmissions(assignmentId);
      setSubs(res?.items || []);
    } catch (e) {
      setSubs([]);
      setSubsErr(e.message || 'Failed to load submissions');
    } finally {
      setSubsLoading(false);
    }
  }

  return (
    <div className="faculty">
      <div className="card wide">
        <div className="au-header">
          <h2>Upload Assignment</h2>
          <div className="au-actions">
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={loading || !title || !courseId}
              title={!title ? 'Enter title' : !courseId ? 'Select course' : 'Upload'}
            >
              {loading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>

        {err && <div className="alert error" style={{ marginBottom: 8 }}>{err}</div>}
        {msg && <div className="alert" style={{ marginBottom: 8 }}>{msg}</div>}

        <div className="au-types">
          {['Video', 'Audio', 'PDF', 'Image (JPG/PNG)', 'Notes (TXT/MD)'].map((t, i) => (
            <span className="type-pill" key={i}>{t}</span>
          ))}
        </div>

        <div className="au-grid">
          <div className="au-field">
            <label className="fd-label">Title</label>
            <input
              className="fd-input full"
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="e.g., CN Lab – Packet Tracer"
            />
          </div>

          <div className="au-field">
            <label className="fd-label">Course</label>
            <select
              className="fd-input full"
              value={courseId}
              onChange={e=>setCourseId(e.target.value)}
            >
              <option value="">Select course</option>
              {(courses||[]).map(c => {
                const cid = getCourseId(c);
                return <option key={cid} value={cid}>{c.name || cid}</option>;
              })}
            </select>
          </div>

          <div className="au-field">
            <label className="fd-label">Due Date</label>
            <input
              className="fd-input full"
              type="date"
              value={dueDate}
              onChange={e=>setDueDate(e.target.value)}
            />
          </div>

          <div className="au-field au-span-2">
            <label className="fd-label">Description</label>
            <textarea
              className="fd-input full"
              rows={3}
              value={description}
              onChange={e=>setDescription(e.target.value)}
              placeholder="Instructions, references, grading notes…"
            />
          </div>

          <div className="au-span-2">
            <div
              className={`dropzone ${dragOver ? 'is-over' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
            >
              <div className="dz-icon">⬆</div>
              <div className="dz-text">
                <strong>Drag & drop</strong> video, audio, images, PDF, or notes here
                <div className="dz-sub">or click to browse</div>
              </div>
              <input
                className="dz-input"
                type="file"
                multiple
                onChange={onPick}
                accept=".mp4,.mov,.mpeg,.mp3,.wav,.aac,.ogg,.pdf,.jpg,.jpeg,.png,.txt,.md"
              />
            </div>

            {files.length === 0 ? (
              <div className="empty-hint">No files selected yet</div>
            ) : (
              <div className="file-summary">
                <span className="dot" />
                <span>{files.length} file(s)</span>
                <span>•</span>
                <span>{Math.ceil(files.reduce((a,f)=>a+f.size,0)/1024)} KB total</span>
              </div>
            )}

            {files.length > 0 && (
              <div className="chips">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className={`chip ${typeClass(f)}`}>
                    <span className="chip-name">{f.name}</span>
                    <span className="chip-meta">{Math.round(f.size/1024)} KB</span>
                    <button className="chip-x" onClick={() => removeFile(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="au-section" style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 8 }}>My Assignments</h3>
          <div className="table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Course</th>
                  <th>Due</th>
                  <th>Files</th>
                  <th>Uploaded</th>
                  <th>Submissions</th> {/* NEW */}
                </tr>
              </thead>
              <tbody>
                {loadingAssignments ? (
                  <tr><td colSpan={6} className="no-results">Loading…</td></tr>
                ) : (assignments || []).length === 0 ? (
                  <tr><td colSpan={6} className="no-results">No assignments yet</td></tr>
                ) : (assignments || []).map((a) => (
                  <tr key={a._id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => openAssignment(a)}
                        className="link-button"
                        title={(a.files || []).length ? 'Open assignment' : 'No files to open'}
                        style={{ cursor: (a.files || []).length ? 'pointer' : 'default' }}
                      >
                        {a.title}
                      </button>
                    </td>
                    <td>{courseNameFromAssignment(a)}</td>
                    <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '-'}</td>
                    <td>{Array.isArray(a.files) ? a.files.length : 0}</td>
                    <td>{a.createdAt ? new Date(a.createdAt).toLocaleString() : '-'}</td>
                    <td>
                      <button
                        className="link-button"
                       onClick={() => { console.log('View subs for', a._id, a.title); setSelectedA(a); loadSubs(a._id); }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(assignments || []).some(a => (a.files || []).length) && (
            <div style={{ marginTop: 8 }}>
              {(assignments || []).map(a => (
                (a.files || []).length > 0 && (
                  <div key={`links-${a._id}`} className="file-list">
                    {a.files.map(f => (
                      <a
                        key={f.url}
                        className="file-link"
                        href={fileUrl(f)}
                        target="_blank"
                        rel="noreferrer"
                        download={f.originalName}
                      >
                        {f.originalName}
                      </a>
                    ))}
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* NEW: Submissions panel */}
        {selectedA && (
          <div className="au-section" style={{ marginTop: 18 }}>
            <div className="au-header" style={{ marginBottom: 8 }}>
              <h3>Submissions for: {selectedA.title}</h3>
              <div className="au-actions">
                <button className="btn" onClick={() => { if (selectedA?._id) loadSubs(selectedA._id); }}>
                  {subsLoading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button className="btn" onClick={() => { setSelectedA(null); setSubs([]); }}>
                  Close
                </button>
              </div>
            </div>

            {subsErr && <div className="alert error" style={{ marginBottom: 8 }}>{subsErr}</div>}
            {subsLoading && <div>Loading submissions…</div>}
            {!subsLoading && !subsErr && subs.length === 0 && (
              <div className="empty-hint">No submissions yet.</div>
            )}

            {!subsLoading && !subsErr && subs.length > 0 && (
              <div className="table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Submitted At</th>
                      <th>Note</th>
                      <th>Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map(s => (
                      <tr key={s._id}>
                        <td>{s.studentName || '-'}</td>
                        <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '-'}</td>
                        <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{s.note || ''}</td>
                        <td>
                          <div className="file-list">
                            {(s.files || []).map((f, i) => (
                              <a
                                key={`${s._id}-${i}`}
                                className="file-link"
                                href={absFileUrl(f)}
                                target="_blank"
                                rel="noreferrer"
                                title={f.originalName || 'file'}
                                download={f.originalName}
                              >
                                📎 {f.originalName || `file-${i+1}`}
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="au-section" style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 8 }}>
            Enrolled Students {courseId ? '' : '(select a course)'}
          </h3>
          <div className="table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Reg/Roll</th>
                </tr>
              </thead>
              <tbody>
                {loadingStudents ? (
                  <tr><td colSpan={3} className="no-results">Loading…</td></tr>
                ) : !courseId ? (
                  <tr><td colSpan={3} className="no-results">Choose a course to view students</td></tr>
                ) : (studentsInCourse || []).length === 0 ? (
                  <tr><td colSpan={3} className="no-results">No students</td></tr>
                ) : (studentsInCourse || []).map((p, idx) => {
                  const prof = p?.profile || {};
                  const dep = prof.department || prof.branch || p?.user?.department || '-';
                  const reg = prof.registerNumber || prof.rollNo || '-';
                  return (
                    <tr key={p?._id || p?.userId || idx}>
                      <td>{displayName(p)}</td>
                      <td>{dep}</td>
                      <td>{reg}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
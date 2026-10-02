import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import AdminAiAttendanceModal from './AdminAiAttendanceModal';
import './AdminAttendance.css';

const SESSIONS = ['FN', 'AN'];
const STATUSES = ['PRESENT', 'ON-DUTY', 'ABSENT'];

export default function AdminAttendance() {
  const [tab, setTab] = useState('student');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [academicYear, setAcademicYear] = useState('2025-26');
  const [semester, setSemester] = useState('Odd');
  const [session, setSession] = useState('FN');
  const [loading, setLoading] = useState(false);
  const [att, setAtt] = useState({});
  const [summary, setSummary] = useState({ totals: { totalClasses: 0, presentClasses: 0, onDutyClasses: 0, absentClasses: 0 } });
  const [showAiModal, setShowAiModal] = useState(false);

  const [students, setStudents] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [courses, setCourses] = useState([]);
  const [studentProfiles, setStudentProfiles] = useState({});

  // Filters
  const [deptFilter, setDeptFilter] = useState('');     // Students tab only
  const [courseFilter, setCourseFilter] = useState(''); // Students tab only

  useEffect(() => {
    let cancel = false;
    async function loadPeople() {
      setLoading(true);
      try {
        const [stu, fac] = await Promise.all([
          api.adminStudents({ limit: 200 }),
          api.adminFaculty({ limit: 200 })
        ]);
        if (!cancel) {
          setStudents(stu?.items || stu?.students || []);
          setFaculty(fac?.items || fac?.faculty || []);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    loadPeople();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const crs = await api.adminCourses({ limit: 500 });
        if (!cancel) setCourses(crs?.items || crs?.courses || []);
      } catch {}
    })();
    return () => { cancel = true; };
  }, []);

  const activePeople = useMemo(() => (tab === 'student' ? students : faculty), [tab, students, faculty]);

  useEffect(() => {
    let cancel = false;
    async function loadDay() {
      setLoading(true);
      try {
        const res = await api.adminAttendanceList({ date, academicYear, semester });
        if (cancel) return;
        const map = {};
        for (const doc of res.items || []) {
          const u = String(doc.userId || '');
          const pick = (doc.dailySchedule || []).find(s => s.session === session);
          map[u] = {
            status: pick?.status || '',
            subject: pick?.subject || '',
            faculty: pick?.faculty || '',
            topic: pick?.topic || '',
            facultyCode: ''
          };
        }
        setAtt(map);
        const sum = await api.adminAttendanceSummary({ from: date, to: date, academicYear, semester });
        if (!cancel) setSummary(sum);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    loadDay();
    return () => { cancel = true; };
  }, [date, academicYear, semester, session]);

  useEffect(() => {
    let cancel = false;
    async function loadProfiles() {
      if (tab !== 'student') return;
      if (!students.length) return;
      const missing = students
        .map(s => s?.user?._id || s?._id)
        .filter(Boolean)
        .filter(id => !studentProfiles[id]);

      if (!missing.length) return;

      try {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              const res = await api.adminStudentProfile(id);
              return { id, profile: res?.profile || {} };
            } catch {
              return { id, profile: {} };
            }
          })
        );
        if (cancel) return;
        setStudentProfiles(prev => {
          const next = { ...prev };
          for (const r of results) next[r.id] = r.profile;
          return next;
        });
      } catch {}
    }
    loadProfiles();
    return () => { cancel = true; };
  }, [tab, students, studentProfiles]);

  function normalizeInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  function lower(s) { return (s || '').toString().trim().toLowerCase(); }
  function equalsIgnoreCase(a, b) {
    return (a || '').toString().trim().toLowerCase() === (b || '').toString().trim().toLowerCase();
  }

  function courseMatchesStudent(course, profile) {
    if (!course || !profile) return false;
    const stuSem = normalizeInt(profile?.semester);
    const crsSem = normalizeInt(course?.semester);
    if (stuSem !== undefined && crsSem !== undefined && crsSem !== stuSem) return false;
    const stuSec = (profile?.section || '').trim().toUpperCase();
    const crsSec = (course?.section || '').trim().toUpperCase();
    if (crsSec && stuSec && crsSec !== stuSec) return false;
    const stuBranch = lower(profile?.branch || profile?.department || '');
    const crsDept = lower(course?.department || '');
    if (crsDept && stuBranch && crsDept !== stuBranch && !crsDept.includes(stuBranch) && !stuBranch.includes(crsDept)) return false;
    return true;
  }

  function subjectsForStudent(uId) {
    const profile = studentProfiles[uId];
    if (!profile) return [];
    return (courses || []).filter(c => courseMatchesStudent(c, profile));
  }

  function subjectsForFaculty(uId, facultyName) {
    if (!uId && !facultyName) return [];
    return (courses || []).filter(c => {
      const byId = String(c.facultyId || '') === String(uId);
      const byName = c.facultyName ? equalsIgnoreCase(c.facultyName, facultyName) : false;
      return byId || byName;
    });
  }

  // Student helpers/filters
 function getId(p) {
  // Prefer the user document id if available
  if (p?.user?._id && /^[0-9a-fA-F]{24}$/.test(p.user._id)) return p.user._id;
  // Some APIs send userId or id
  if (p?.userId && /^[0-9a-fA-F]{24}$/.test(p.userId)) return p.userId;
  if (p?.id && /^[0-9a-fA-F]{24}$/.test(p.id)) return p.id;
  // Fallback: only use p._id if it is a valid ObjectId (and truly is the user id in your API)
  if (p?._id && /^[0-9a-fA-F]{24}$/.test(p._id)) return p._id;
  return '';
}
  function displayName(p) {
    const u = p?.user || p;
    const first = u?.firstName || '';
    const last = u?.lastName || '';
    return (first + ' ' + last).trim() || u?.name || u?.email || 'Unknown';
  }
  function studentDepartment(p) {
    const id = getId(p);
    const prof = studentProfiles[id];
    const u = p?.user || p;
    return (
      prof?.department ||
      prof?.branch ||
      p?.department ||
      u?.department ||
      '-'
    );
  }
  const studentDepartments = useMemo(() => {
    const set = new Set();
    for (const s of students || []) {
      const id = getId(s);
      const prof = studentProfiles[id] || {};
      const dept =
        prof?.department ||
        prof?.branch ||
        s?.department ||
        (s?.user || s)?.department ||
        '';
      const val = (dept || '').toString().trim();
      if (val) set.add(val);
    }
    return Array.from(set).sort();
  }, [students, studentProfiles]);

  // Faculty helpers
  function facultyDepartment(p) {
    const u = p?.user || p;
    return p?.department || p?.dept || p?.departmentName || p?.profile?.department || u?.department || '-';
  }
  function facultyCodeByName(name) {
    const byCourse = (courses || []).find(c => c.facultyName && equalsIgnoreCase(c.facultyName, name));
    if (byCourse) return byCourse.facultyCode || byCourse.facultyId || '';
    const byFac = (faculty || []).find(f => equalsIgnoreCase(displayName(f), name));
    return byFac?.profile?.facultyId || byFac?.facultyCode || '';
  }
  function facultyCodeFromRowOrProfile(p, row) {
    return row?.facultyCode || p?.profile?.facultyId || p?.facultyCode || '';
  }
  const facultyIdByName = useMemo(() => {
    const map = new Map();
    for (const c of courses || []) {
      const nm = (c?.facultyName || '').trim();
      const code = c?.facultyCode || c?.facultyId || '';
      if (nm && code) map.set(nm.toLowerCase(), code);
    }
    for (const f of faculty || []) {
      const nm = (displayName(f) || '').trim();
      const code = f?.profile?.facultyId || f?.facultyCode || '';
      if (nm && code && !map.has(nm.toLowerCase())) {
        map.set(nm.toLowerCase(), code);
      }
    }
    return map;
  }, [courses, faculty]);

  // Course options for Students filter
  const courseNames = useMemo(() => {
    const set = new Set();
    for (const c of courses || []) {
      const name = (c?.name || '').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [courses]);

  // Apply department (students) and course (students) filters
  const filteredPeople = useMemo(() => {
    let list = activePeople || [];

    if (tab === 'student' && deptFilter) {
      list = list.filter(p => studentDepartment(p) === deptFilter);
    }

    if (tab === 'student' && courseFilter) {
      list = list.filter(p => {
        const id = getId(p);
        const options = subjectsForStudent(id) || [];
        return options.some(c => c.name === courseFilter);
      });
    }

    return list;
  }, [activePeople, tab, deptFilter, courseFilter, studentProfiles, courses]);

  // Only persist for real Mongo ObjectIds
  function isValidObjectId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
  }

  async function setRow(uKey, patch) {
    const next = { ...(att[uKey] || {}), ...patch };
    setAtt(prev => ({ ...prev, [uKey]: next }));

    if (!next.status) return;
    if (!isValidObjectId(uKey)) return;

    await api.adminAttendanceMarkSession({
      userId: uKey,
      date,
      session,
      status: next.status,
      subject: next.subject || '',
      faculty: next.faculty || '',
      topic: next.topic || '',
      academicYear,
      semester
    });

    const sum = await api.adminAttendanceSummary({ from: date, to: date, academicYear, semester });
    setSummary(sum);
  }

  async function bulk(status) {
    const items = (filteredPeople || [])
      .map(p => getId(p))
      .filter(id => isValidObjectId(id))
      .map(id => ({ userId: id, session, status }));

    if (items.length === 0) return;

    await api.adminAttendanceBulkDay({ date, academicYear, semester, items });

    const map = {};
    for (const it of items) map[it.userId] = { ...(att[it.userId] || {}), status: it.status };
    setAtt(prev => ({ ...prev, ...map }));

    const sum = await api.adminAttendanceSummary({ from: date, to: date, academicYear, semester });
    setSummary(sum);
  }

  async function handleApplyAiAttendance(matchedIds, targetGroup) {
    if (!matchedIds || matchedIds.length === 0) return;
    const idSet = new Set(matchedIds.map(String));

    // Choose relevant group
    const people = (targetGroup === 'faculty' || (tab === 'faculty' && !targetGroup)) ? faculty : students;
    const items = people
      .filter(p => {
        const id = String(getId(p));
        const profId = String(p?.profile?.facultyId || p?.facultyId || '');
        const roll = String(p?.profile?.rollNo || p?.rollNo || '');
        return idSet.has(id) || idSet.has(profId) || idSet.has(roll);
      })
      .map(p => ({
        userId: getId(p),
        session,
        status: 'PRESENT'
      }))
      .filter(it => isValidObjectId(it.userId));

    // Fallback: If matched directly by raw Mongo userId
    if (items.length === 0) {
      for (const mid of matchedIds) {
        if (isValidObjectId(mid)) {
          items.push({ userId: mid, session, status: 'PRESENT' });
        }
      }
    }

    if (items.length > 0) {
      try {
        await api.adminAttendanceBulkDay({ date, academicYear, semester, items });
        const map = {};
        for (const it of items) {
          map[it.userId] = { ...(att[it.userId] || {}), status: 'PRESENT' };
        }
        setAtt(prev => ({ ...prev, ...map }));
        const sum = await api.adminAttendanceSummary({ from: date, to: date, academicYear, semester });
        setSummary(sum);
      } catch (err) {
        console.error('Failed to mark AI attendance:', err);
      }
    }
  }

  function statusBadgeClass(s) {
    if (s === 'PRESENT') return 'status-badge present';
    if (s === 'ABSENT') return 'status-badge absent';
    if (s === 'ON-DUTY') return 'status-badge on-duty';
    return 'status-badge unmarked';
  }

  return (
    <div className="attendance-container">
      <div className="attendance-header">
        <h2>Attendance</h2>
        <div className="action-buttons" role="group" aria-label="Tabs">
          <button className={`action-btn ${tab === 'student' ? 'on-duty active' : 'on-duty'}`} onClick={() => setTab('student')}>
            Students
          </button>
          <button className={`action-btn ${tab === 'faculty' ? 'on-duty active' : 'on-duty'}`} onClick={() => setTab('faculty')}>
            Faculty
          </button>
        </div>
      </div>

      <div className="attendance-controls">
        <div className="date-picker-container">
          <label>Date</label>
          <input className="date-picker" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="date-picker-container">
          <label>Academic Year</label>
          <input className="date-picker" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
        </div>
        <div className="date-picker-container">
          <label>Semester</label>
          <select className="date-picker" value={semester} onChange={e => setSemester(e.target.value)}>
            <option value="Odd">Odd</option>
            <option value="Even">Even</option>
          </select>
        </div>
        <div className="date-picker-container">
          <label>Session</label>
          <select className="date-picker" value={session} onChange={e => setSession(e.target.value)}>
            {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {tab === 'student' && (
          <>
            <div className="date-picker-container">
              <label>Department</label>
              <select
                className="date-picker"
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
              >
                <option value="">All</option>
                {studentDepartments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="date-picker-container">
              <label>Course</label>
              <select
                className="date-picker"
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
              >
                <option value="">All</option>
                {courseNames.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="action-buttons" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="action-btn"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
            }}
            onClick={() => setShowAiModal(true)}
          >
            ⚡ AI Attendance ({tab === 'student' ? 'Students' : 'Faculty'})
          </button>
          <button className="action-btn present" onClick={() => bulk('PRESENT')}>Mark all Present</button>
          <button className="action-btn absent" onClick={() => bulk('ABSENT')}>Mark all Absent</button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="attendance-table">
          <thead>
            {tab === 'faculty' ? (
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Faculty ID</th>
                <th>Status</th>
              </tr>
            ) : (
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
                <th>Subject</th>
                <th>Faculty</th>
                <th>Faculty ID</th>
                <th style={{ width: 260 }}>Topic</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading && filteredPeople.length === 0 ? (
              <tr><td colSpan={tab === 'faculty' ? 4 : 7} className="loading">Loading...</td></tr>
            ) : filteredPeople.length === 0 ? (
              <tr><td colSpan={tab === 'faculty' ? 4 : 7} className="no-results">No records</td></tr>
            ) : filteredPeople.map((p, idx) => {
              const userId = getId(p);
              const uKey = userId || `row-${idx}`;
              const row = att[uKey] || {};

              // Base subject options by tab
              const baseOptions =
                tab === 'student'
                  ? subjectsForStudent(userId)
                  : subjectsForFaculty(userId, displayName(p));

              // Apply Course filter to subject options ONLY for students
              const subjectOptions = (tab === 'student' && courseFilter)
                ? (baseOptions || []).filter(c => c.name === courseFilter)
                : (baseOptions || []);

              if (tab === 'faculty') {
                const name = displayName(p);
                const resolvedCode =
                  facultyCodeFromRowOrProfile(p, row) ||
                  facultyIdByName.get((name || '').toLowerCase()) ||
                  facultyCodeByName(name) || '';

                return (
                  <tr key={uKey}>
                    <td>
                      <div className="name-cell">
                        <div className="avatar">
                          {(() => {
                            const parts = name.split(' ').filter(Boolean);
                            const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
                            return initials.toUpperCase() || 'U';
                          })()}
                        </div>
                        <div className="name-text">{name}</div>
                      </div>
                    </td>
                    <td>{facultyDepartment(p)}</td>
                    <td>
                      <input className="field-input" value={resolvedCode} readOnly />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={statusBadgeClass(row.status)}>{row.status || 'unmarked'}</span>
                        </div>
                        <div className="status-group">
                          <button
                            type="button"
                            className={`action-btn present ${row.status === 'PRESENT' ? 'active' : ''}`}
                            onClick={() => setRow(uKey, { status: 'PRESENT' })}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            className={`action-btn on-duty ${row.status === 'ON-DUTY' ? 'active' : ''}`}
                            onClick={() => setRow(uKey, { status: 'ON-DUTY' })}
                          >
                            On-Duty
                          </button>
                          <button
                            type="button"
                            className={`action-btn absent ${row.status === 'ABSENT' ? 'active' : ''}`}
                            onClick={() => setRow(uKey, { status: 'ABSENT' })}
                          >
                            Absent
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              // Students tab
              return (
                <tr key={uKey}>
                  <td>
                    <div className="name-cell">
                      <div className="avatar">
                        {(() => {
                          const n = displayName(p);
                          const parts = n.split(' ').filter(Boolean);
                          const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
                          return initials.toUpperCase() || 'U';
                        })()}
                      </div>
                      <div className="name-text">{displayName(p)}</div>
                    </div>
                  </td>

                  <td>{studentDepartment(p)}</td>

                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={statusBadgeClass(row.status)}>{row.status || 'unmarked'}</span>
                      </div>
                      <div className="status-group">
                        <button
                          type="button"
                          className={`action-btn present ${row.status === 'PRESENT' ? 'active' : ''}`}
                          onClick={() => setRow(uKey, { status: 'PRESENT' })}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          className={`action-btn on-duty ${row.status === 'ON-DUTY' ? 'active' : ''}`}
                          onClick={() => setRow(uKey, { status: 'ON-DUTY' })}
                        >
                          On-Duty
                        </button>
                        <button
                          type="button"
                          className={`action-btn absent ${row.status === 'ABSENT' ? 'active' : ''}`}
                          onClick={() => setRow(uKey, { status: 'ABSENT' })}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="field-group">
                      <select
                        className="field-select"
                        value={row.subject || ''}
                        onChange={e => {
                          const subj = e.target.value;
                          if (!subj) {
                            setRow(uKey, { subject: '', faculty: '', facultyCode: '' });
                            return;
                          }
                          const course = subjectOptions.find(c => c.name === subj);
                          const fallbackName = row.faculty || displayName(p);
                          setRow(uKey, {
                            subject: subj,
                            faculty: course?.facultyName || fallbackName,
                            facultyCode: course?.facultyCode || course?.facultyId || ''
                          });
                        }}
                      >
                        <option value="">Select subject</option>
                        {subjectOptions.map(c => (
                          <option key={c._id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  <td>
                    <input
                      className="field-input"
                      value={row.faculty || ''}
                      onChange={e => setRow(uKey, { faculty: e.target.value })}
                      placeholder="Faculty"
                    />
                  </td>

                  <td>
                    <input
                      className="field-input"
                      value={row.facultyCode || ''}
                      onChange={e => setRow(uKey, { facultyCode: e.target.value })}
                      placeholder="Faculty ID"
                    />
                  </td>

                  <td>
                    <input
                      className="field-input"
                      value={row.topic || ''}
                      onChange={e => setRow(uKey, { topic: e.target.value })}
                      placeholder="Topic"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="attendance-controls" style={{ justifyContent: 'flex-start' }}>
        <div className="status-badge present">Present: {summary?.totals?.presentClasses || 0}</div>
        <div className="status-badge on-duty">On-Duty: {summary?.totals?.onDutyClasses || 0}</div>
        <div className="status-badge absent">Absent: {summary?.totals?.absentClasses || 0}</div>
        <div className="status-badge unmarked">Total classes: {summary?.totals?.totalClasses || 0}</div>
      </div>

      <AdminAiAttendanceModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        initialTarget={tab}
        onApplyAttendance={handleApplyAiAttendance}
      />
    </div>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import './FacultyAttendance.css';
import FacultyAiAttendanceModal from './FacultyAiAttendanceModal';

const SESSIONS = ['FN', 'AN'];

export default function FacultyAttendance() {
  const [tab, setTab] = useState('my'); // 'my' | 'students'
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState('FN');

  // Range for "My Attendance"
  const [useRange, setUseRange] = useState(true);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0,10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0,10));

  // My attendance
  const [myRows, setMyRows] = useState([]);

  // Students marking
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [att, setAtt] = useState({}); // per-student row map

  const subject = useMemo(() => {
    const c = (courses || []).find(x => x._id === courseId);
    return c?.name || '';
  }, [courseId, courses]);

  // Semester defaults and subject-wide overall (semester) totals
  function semesterDefaultRange() {
    const now = new Date();
    const y = now.getFullYear();
    const semStart = new Date(now.getMonth() < 6 ? `${y}-01-01` : `${y}-07-01`);
    const semEnd = now;
    return {
      from: semStart.toISOString().slice(0, 10),
      to: semEnd.toISOString().slice(0, 10)
    };
  }

  const [{ from: semFromDefault, to: semToDefault }] = useState(() => [semesterDefaultRange()]);
  const [semFrom, setSemFrom] = useState(semFromDefault);
  const [semTo, setSemTo] = useState(semToDefault);
  const [overallSemTotals, setOverallSemTotals] = useState({
    total: 0, present: 0, onDuty: 0, absent: 0, pct: 0
  });

  useEffect(() => {
    let cancel = false;
    api.facultyCourses()
      .then(r => {
        if (!cancel) {
          const list = r.items || [];
          setCourses(list);
          if (list.length > 0) {
            setCourseId(prev => prev || list[0]._id);
          }
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Count helpers based on dailySchedule (robust even if counters missing)
  function countDay(dailySchedule = []) {
    let present = 0, onDuty = 0, absent = 0, total = 0;
    for (const s of dailySchedule) {
      if (!s?.session || !s?.status) continue;
      total += 1;
      if (s.status === 'PRESENT') present += 1;
      else if (s.status === 'ON-DUTY') onDuty += 1;
      else if (s.status === 'ABSENT') absent += 1;
    }
    return { present, onDuty, absent, total };
  }
  function aggregateOverallBySchedule(items = []) {
    let present = 0, onDuty = 0, absent = 0, total = 0;
    for (const d of items) {
      const c = countDay(d?.dailySchedule || []);
      present += c.present; onDuty += c.onDuty; absent += c.absent; total += c.total;
    }
    const percentage = total ? Math.round(((present + onDuty) / total) * 10000) / 100 : 0;
    return { present, onDuty, absent, total, percentage };
  }

  // Load my attendance with range (graceful fallback)
  useEffect(() => {
    if (tab !== 'my') return;
    let cancel = false;
    (async () => {
      try {
        const params = useRange ? { from: fromDate, to: toDate } : { date };
        const r = await api.facultyAttendanceList(params);
        if (!cancel) setMyRows(r.items || []);
      } catch {
        try {
          const r2 = await api.facultyAttendanceList({ date });
          if (!cancel) setMyRows(r2.items || []);
        } catch {}
      }
    })();
    return () => { cancel = true; };
  }, [tab, date, useRange, fromDate, toDate]);

  // Load students list
  useEffect(() => {
    if (tab !== 'students' || !courseId) { setStudents([]); return; }
    let cancel = false;
    api.facultyCourseStudents(courseId)
      .then(r => { if (!cancel) setStudents(r.items || []); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [tab, courseId]);

  // Subject-wise semester overall (using analytics subject-summary)
  useEffect(() => {
    if (!subject) return;
    let cancelled = false;

    async function loadSubjectSemester() {
      try {
        const res = await api.facultyAnalyticsSubjectSummary({ from: semFrom, to: semTo });
        const items = Array.isArray(res?.items) ? res.items : [];
        const row = items.find(
          it => (it.subject || '').trim().toLowerCase() === (subject || '').trim().toLowerCase()
        );
        if (!cancelled) {
          if (row) {
            const { total = 0, present = 0, onDuty = 0, absent = 0, pct = 0 } = row;
            setOverallSemTotals({ total, present, onDuty, absent, pct });
          } else {
            setOverallSemTotals({ total: 0, present: 0, onDuty: 0, absent: 0, pct: 0 });
          }
        }
      } catch {
        if (!cancelled) setOverallSemTotals({ total: 0, present: 0, onDuty: 0, absent: 0, pct: 0 });
      }
    }

    loadSubjectSemester();
    return () => { cancelled = true; };
  }, [subject, semFrom, semTo]);

  // Auto-refresh every 15s while on "My Attendance"
  useEffect(() => {
    if (tab !== 'my') return;
    const id = setInterval(async () => {
      try {
        const params = useRange ? { from: fromDate, to: toDate } : { date };
        const r = await api.facultyAttendanceList(params);
        setMyRows(r.items || []);
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [tab, date, useRange, fromDate, toDate]);

  function getStudentId(p) { return p?.user?._id || p?.userId || p?.id || ''; }
  function displayName(p) {
    const u = p?.user || {};
    const prof = p?.profile || {};
    const first = prof.firstName || u.firstName || '';
    const last  = prof.lastName  || u.lastName  || '';
    const idLike = prof.registerNumber || prof.rollNo || '';
    return (first + ' ' + last).trim() || idLike || u.email || 'Unknown';
  }
  function isValidObjectId(id) { return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id); }

  // Helpers for "My Attendance" layout
  function pickSession(doc, sess) {
    return (doc?.dailySchedule || []).find(s => s.session === sess);
  }
  const myDocForDay = useMemo(() => {
    const target = new Date(date).toDateString();
    return (myRows || []).find(d => new Date(d.date).toDateString() === target) || null;
  }, [myRows, date]);

  const fnEntry = useMemo(() => (myDocForDay ? pickSession(myDocForDay, 'FN') : null), [myDocForDay]);
  const anEntry = useMemo(() => (myDocForDay ? pickSession(myDocForDay, 'AN') : null), [myDocForDay]);

  // Compute overall across the range (prefer counters; fallback to dailySchedule)
  const overall = useMemo(() => {
    if (!Array.isArray(myRows) || myRows.length === 0) {
      return {
        academicYear: '',
        semester: '',
        totalClasses: 0,
        presentClasses: 0,
        onDutyClasses: 0,
        absentClasses: 0,
        overallStats: { totalPercentage: 0, presentPercentage: 0, onDutyPercentage: 0, absentPercentage: 0 }
      };
    }
    let total = 0, present = 0, onDuty = 0, absent = 0;
    let haveCounters = true;
    for (const d of myRows) {
      if ([d.totalClasses, d.presentClasses, d.onDutyClasses, d.absentClasses].some(v => typeof v !== 'number')) {
        haveCounters = false; break;
      }
    }
    if (haveCounters) {
      for (const d of myRows) {
        total += d.totalClasses || 0;
        present += d.presentClasses || 0;
        onDuty += d.onDutyClasses || 0;
        absent += d.absentClasses || 0;
      }
    } else {
      const agg = aggregateOverallBySchedule(myRows);
      total = agg.total; present = agg.present; onDuty = agg.onDuty; absent = agg.absent;
    }
    const pct = (num) => total > 0 ? Math.round((num / total) * 10000) / 100 : 0;
    return {
      academicYear: myRows[0]?.academicYear || '',
      semester: myRows[0]?.semester || '',
      totalClasses: total,
      presentClasses: present,
      onDutyClasses: onDuty,
      absentClasses: absent,
      overallStats: {
        totalPercentage: pct(present + onDuty),
        presentPercentage: pct(present),
        onDutyPercentage: pct(onDuty),
        absentPercentage: pct(absent),
      }
    };
  }, [myRows]);

  const todaysSchedule = useMemo(() => {
    if (!myDocForDay) return [];
    return (myDocForDay.dailySchedule || []).filter(s => {
      const sd = new Date(s.date).toDateString();
      return sd === new Date(date).toDateString();
    });
  }, [myDocForDay, date]);

  const displaySchedule = todaysSchedule.length > 0
    ? todaysSchedule
    : [
        { session: 'FN', status: fnEntry?.status || 'UNMARKED', subject: fnEntry?.subject || '', faculty: 'You', topic: fnEntry?.topic || '' },
        { session: 'AN', status: anEntry?.status || 'UNMARKED', subject: anEntry?.subject || '', faculty: 'You', topic: anEntry?.topic || '' },
      ];

  // Manual refresh for "My Attendance"
  async function refreshMyAttendance() {
    try {
      const params = useRange ? { from: fromDate, to: toDate } : { date };
      const r = await api.facultyAttendanceList(params);
      setMyRows(r.items || []);
    } catch {}
  }

  // Students marking actions
  async function setRow(uId, patch) {
    const course = (courses || []).find(c => c._id === courseId);
    const next = { ...(att[uId] || {}), ...patch };
    if (!next.subject && course?.name) next.subject = course.name;

    setAtt(prev => ({ ...prev, [uId]: next }));

    if (!courseId || !next.status || !isValidObjectId(uId)) return;
    await api.facultyMarkStudentSession({
      studentId: uId,
      date,
      session,
      status: next.status,
      subject: next.subject || (course?.name || ''),
      topic: next.topic || '',
      courseId
    });
  }

  async function bulk(status) {
    const items = (students || [])
      .map(p => {
        const id = p?.user?._id || p?.userId || p?.id || '';
        return id;
      })
      .filter(id => isValidObjectId(id))
      .map(id => ({ studentId: id, session, status, subject })); // include subject

    if (!items.length) return;
    await api.facultyBulkDay({ date, courseId, items });

    const map = {};
    for (const it of items) map[it.studentId] = { ...(att[it.studentId] || {}), status: it.status, subject };
    setAtt(prev => ({ ...prev, ...map }));
  }

  // SnapClass AI Attendance Handler
  function handleApplyAiAttendance(matchedStudentIds = []) {
    if (!matchedStudentIds.length) return;
    const map = {};
    for (const id of matchedStudentIds) {
      map[id] = { ...(att[id] || {}), status: 'PRESENT', subject };
      api.facultyMarkStudentSession({
        studentId: id,
        date,
        session,
        status: 'PRESENT',
        subject: subject || 'AI Attendance',
        topic: 'SnapClass AI Verified',
        courseId
      }).catch(() => {});
    }
    setAtt(prev => ({ ...prev, ...map }));
  }

  return (
    <div className="attendance-container">
      {/* Header and Tab Switch */}
      <div className="attendance-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 className="attendance-title">Attendance Dashboard</h2>
            <p className="attendance-subtitle">
              {tab === 'my' ? 'Track your FN/AN attendance and daily schedule' : 'Select a course and mark students'}
            </p>
          </div>
          <div className="action-buttons">
            <button className={`action-btn on-duty ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>My Attendance</button>
            <button className={`action-btn on-duty ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>Mark Students</button>
            {tab === 'my' && (
              <button className="action-btn" onClick={refreshMyAttendance}>Refresh</button>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="day-view" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="date-picker-container">
            <label>Date</label>
            <input className="date-picker" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="date-picker-container">
            <label>Session</label>
            <select className="date-picker" value={session} onChange={e => setSession(e.target.value)}>
              {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {tab === 'my' && (
            <>
              <div className="date-picker-container">
                <label>Use Range</label>
                <select className="date-picker" value={useRange ? '1' : '0'} onChange={e => setUseRange(e.target.value === '1')}>
                  <option value="1">Yes</option>
                  <option value="0">No (single day)</option>
                </select>
              </div>
              {useRange && (
                <>
                  <div className="date-picker-container">
                    <label>From</label>
                    <input className="date-picker" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  </div>
                  <div className="date-picker-container">
                    <label>To</label>
                    <input className="date-picker" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'students' && (
            <>
              <div className="date-picker-container">
                <label>Course</label>
                <select className="date-picker" value={courseId} onChange={e => setCourseId(e.target.value)}>
                  <option value="">Select course</option>
                  {(courses || []).map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.section ? `(${c.section})` : ''} {c.semester ? `- Sem ${c.semester}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="action-buttons" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="action-btn"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
                    cursor: !courseId ? 'not-allowed' : 'pointer',
                    opacity: !courseId ? 0.6 : 1
                  }}
                  onClick={() => setIsAiModalOpen(true)}
                  disabled={!courseId}
                  title={!courseId ? 'Select a course first to launch AI Scanner' : 'Launch SnapClass AI Scanner'}
                >
                  ⚡ AI Attendance Scanner
                </button>
                <button className="action-btn present" onClick={() => bulk('PRESENT')}>Mark all Present</button>
                <button className="action-btn absent" onClick={() => bulk('ABSENT')}>Mark all Absent</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SnapClass AI Biometric Roll-Call Banner */}
      {tab === 'students' && courseId && (
        <div style={{
          marginTop: 16,
          padding: '14px 20px',
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.14), rgba(6, 182, 212, 0.14))',
          borderRadius: '12px',
          border: '1px solid rgba(99, 102, 241, 0.28)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>⚡</span>
              <strong style={{ color: '#fff', fontSize: '1rem' }}>SnapClass AI Biometric Roll-Call Active</strong>
              <span style={{ fontSize: '0.75rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Face & Voice</span>
            </div>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              Take a group photo of the classroom or record roll-call voice waves to instantly detect and mark students present.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <a
              href="http://localhost:5002"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#38bdf8', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}
            >
              Learn More ↗
            </a>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)'
              }}
            >
              📸 Scan Classroom Now
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'my' ? (
        <div className="attendance-wrapper">
          <div className="main-grid">
            {/* Profile + Overall */}
            <div className="profile-card">
              <div className="profile-avatar">ME</div>
              <h2 className="profile-name"></h2>
              <p className="profile-email"></p>

              <div className="profile-stats">
                <h3 className="stats-title">
                  Overall {overall.academicYear ? `- ACY ${overall.academicYear}` : ''} {overall.semester ? `- ${overall.semester} Sem` : ''}
                </h3>

                <div className="main-progress">
                  <CircularProgressbar
                    value={overall.overallStats.totalPercentage}
                    text={`${overall.overallStats.totalPercentage}%`}
                    styles={buildStyles({
                      textColor: '#06dd7cff',
                      pathColor: '#02f0a4ff',
                      trailColor: '#f3f4f6',
                      textSize: '16px',
                    })}
                  />
                </div>

                <div className="sub-progress-grid">
                  <div className="sub-progress-item">
                    <div className="sub-progress-circle">
                      <CircularProgressbar
                        value={overall.overallStats.presentPercentage}
                        text={`${overall.overallStats.presentPercentage}%`}
                        styles={buildStyles({
                          textColor: '#059669',
                          pathColor: '#059669',
                          trailColor: '#f3f4f6',
                          textSize: '12px',
                        })}
                      />
                    </div>
                    <p className="sub-progress-label">Present</p>
                  </div>

                  <div className="sub-progress-item">
                    <div className="sub-progress-circle">
                      <CircularProgressbar
                        value={overall.overallStats.onDutyPercentage}
                        text={`${overall.overallStats.onDutyPercentage}%`}
                        styles={buildStyles({
                          textColor: '#d97706',
                          pathColor: '#d97706',
                          trailColor: '#f3f4f6',
                          textSize: '12px',
                        })}
                      />
                    </div>
                    <p className="sub-progress-label">On-Duty</p>
                  </div>

                  <div className="sub-progress-item">
                    <div className="sub-progress-circle">
                      <CircularProgressbar
                        value={overall.overallStats.absentPercentage}
                        text={`${overall.overallStats.absentPercentage}%`}
                        styles={buildStyles({
                          textColor: '#dc2626',
                          pathColor: '#dc2626',
                          trailColor: '#f3f4f6',
                          textSize: '12px',
                        })}
                      />
                    </div>
                    <p className="sub-progress-label">Absent</p>
                  </div>
                </div>

                {/* NEW: Overall (Semester) for current subject */}
                
              
              </div>
            </div>

            {/* Class Statistics */}
            <div className="subjects-grid">
              <div className="subject-card">
                <h3 className="subject-title">Class Statistics</h3>
                <div className="class-stats">
                  <div className="stat-item">
                    <span className="stat-number">{overall.totalClasses}</span>
                    <span className="stat-label">Total Classes</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{overall.presentClasses}</span>
                    <span className="stat-label">Present</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{overall.onDutyClasses}</span>
                    <span className="stat-label">On-Duty</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{overall.absentClasses}</span>
                    <span className="stat-label">Absent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overall totals across range */}
          <div className="attendance-controls" style={{ justifyContent: 'flex-start', gap: '0.75rem', marginTop: 12 }}>
            <div className="status-badge present">Present: {overall.presentClasses}</div>
            <div className="status-badge on-duty">On-Duty: {overall.onDutyClasses}</div>
            <div className="status-badge absent">Absent: {overall.absentClasses}</div>
            <div className="status-badge unmarked">Total: {overall.totalClasses}</div>
            <div className="status-badge" style={{ borderColor: '#22c55e' }}>
              Overall %: {overall.overallStats.totalPercentage}%
            </div>
          </div>

          {/* Day View - FN/AN */}
          <div className="day-view">
            <h2 className="day-view-title">
              Today&apos;s Schedule - {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </h2>

            <div className="fn-an-grid">
              {displaySchedule.map((s, i) => (
                <div key={i} className="session-card">
                  <div className="session-header">
                    <h3 className="session-title">
                      {s.session === 'FN' ? 'Forenoon (FN)' : 'Afternoon (AN)'}
                    </h3>
                    <span className={`status-badge ${
                      s.status === 'PRESENT'
                        ? 'status-present'
                        : s.status === 'ON-DUTY'
                        ? 'status-on-duty'
                        : s.status === 'ABSENT'
                        ? 'status-absent'
                        : ''
                    }`}>
                      {s.status || 'UNMARKED'}
                    </span>
                  </div>

                  {(s.subject || s.topic) && (
                    <div className="session-details">
                      {s.subject && <p><span>Subject:</span> {s.subject}</p>}
                      <p><span>Faculty:</span> You</p>
                      {s.topic && <p><span>Topic:</span> {s.topic}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Daily summary across returned range */}
          <div className="table-wrapper" style={{ marginTop: 12 }}>
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Present</th>
                  <th>On-Duty</th>
                  <th>Absent</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(myRows || []).map((d) => {
                  const c = countDay(d?.dailySchedule || []);
                  const ds = new Date(d.date).toISOString().slice(0,10);
                  return (
                    <tr key={d._id || ds}>
                      <td>{ds}</td>
                      <td>{c.present}</td>
                      <td>{c.onDuty}</td>
                      <td>{c.absent}</td>
                      <td>{c.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="attendance-wrapper">
          <section className="day-view">
            <div className="day-view-title">Mark Students</div>
            <div className="table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Subject</th>
                    <th style={{ width: 260 }}>Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {(students || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="no-results" style={{ padding: '36px 16px', textAlign: 'center' }}>
                        {!courseId ? (
                          <div>
                            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>👈</div>
                            <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>Please select a Course from the dropdown above</strong>
                            <p style={{ color: '#94a3b8', margin: '6px 0 0', fontSize: '0.875rem' }}>
                              Choose a course above to load the student list and mark attendance.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>👥</div>
                            <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>No students found for this course</strong>
                            <p style={{ color: '#94a3b8', margin: '6px 0 0', fontSize: '0.875rem' }}>
                              Ensure students are enrolled and their profile matches this course's department & semester.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (students || []).map((p, idx) => {
                    const id = p?.user?._id || p?.userId || p?.id || '';
                    const row = att[id] || {};
                    const canPersist = isValidObjectId(id);
                    const course = (courses || []).find(c => c._id === courseId);

                    return (
                      <tr key={id || `row-${idx}`}>
                        <td>{displayName(p)}</td>
                        <td>{p?.user?.department || p?.profile?.department || p?.profile?.branch || '-'}</td>
                        <td>
                          <div className="status-group">
                            <button type="button" className={`action-btn present ${row.status === 'PRESENT' ? 'active' : ''}`} onClick={() => setRow(id, { status: 'PRESENT' })} disabled={!canPersist}>Present</button>
                            <button type="button" className={`action-btn on-duty ${row.status === 'ON-DUTY' ? 'active' : ''}`} onClick={() => setRow(id, { status: 'ON-DUTY' })} disabled={!canPersist}>On-Duty</button>
                            <button type="button" className={`action-btn absent ${row.status === 'ABSENT' ? 'active' : ''}`} onClick={() => setRow(id, { status: 'ABSENT' })} disabled={!canPersist}>Absent</button>
                          </div>
                        </td>
                        <td>
                          <select className="field-select" value={row.subject || ''} onChange={e => setRow(id, { subject: e.target.value })} disabled={!canPersist}>
                            <option value="">{course ? `Use ${course.name}` : 'Select subject'}</option>
                            {course && <option value={course.name}>{course.name}</option>}
                          </select>
                        </td>
                        <td>
                          <input className="field-input" value={row.topic || ''} onChange={e => setRow(id, { topic: e.target.value })} placeholder="Topic" disabled={!canPersist} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SnapClass AI Biometric Scanner Modal */}
      <FacultyAiAttendanceModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        courseId={courseId}
        courseName={subject}
        students={students}
        onApplyAttendance={handleApplyAiAttendance}
      />
    </div>
  );
}
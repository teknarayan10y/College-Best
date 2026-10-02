import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import '../faculty/FacultyAttendance.css';

export default function StudentAttendance() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [useRange, setUseRange] = useState(true);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Subject filter for daily table
  const [subjectFilter, setSubjectFilter] = useState('');
  // All-time rows for Overall card
  const [allRows, setAllRows] = useState([]);

  // Helper: keep only first occurrence per subject for a day
  function uniqueBySubject(entries) {
    const seen = new Set();
    return (entries || []).filter(s => {
      const key = (s.subject || '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadAttendance() {
    setLoading(true);
    try {
      const params = useRange ? { from: fromDate, to: toDate } : { date };
      const r = await api.studentAttendanceList(params);
      setRows(r.items || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Initial and filter-based load
  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRange, fromDate, toDate, date]);

  // Load all-time (overall) once
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.studentAttendanceList({}); // no date filter = overall
        if (!cancel) setAllRows(r.items || []);
      } catch {
        if (!cancel) setAllRows([]);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Auto refresh overall every 60s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await api.studentAttendanceList({});
        setAllRows(r.items || []);
      } catch { }
    }, 60000);
    return () => clearInterval(id);
  }, [useRange, fromDate, toDate, date]);

  // Refresh filtered rows when tab gains focus
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') loadAttendance(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [useRange, fromDate, toDate, date]);

  // Overall totals and percentages (ALL TIME via allRows)
  const totals = useMemo(() => {
    let total=0, present=0, onDuty=0, absent=0;
    for (const d of (allRows || [])) {
      if (
        typeof d.totalClasses === 'number' &&
        typeof d.presentClasses === 'number' &&
        typeof d.onDutyClasses === 'number' &&
        typeof d.absentClasses === 'number'
      ) {
        total += d.totalClasses || 0;
        present += d.presentClasses || 0;
        onDuty += d.onDutyClasses || 0;
        absent += d.absentClasses || 0;
      } else {
        const sc = d?.dailySchedule || [];
        total += sc.length;
        present += sc.filter(x => x.status === 'PRESENT').length;
        onDuty += sc.filter(x => x.status === 'ON-DUTY').length;
        absent += sc.filter(x => x.status === 'ABSENT').length;
      }
    }
    const pct = total ? Math.round(((present + onDuty) / total) * 10000) / 100 : 0;
    const presentPct = total ? Math.round((present / total) * 10000) / 100 : 0;
    const onDutyPct = total ? Math.round((onDuty / total) * 10000) / 100 : 0;
    const absentPct = total ? Math.round((absent / total) * 10000) / 100 : 0;
    return { total, present, onDuty, absent, pct, presentPct, onDutyPct, absentPct };
  }, [allRows]);

  // Subject-wise stats across the currently loaded range (per-day unique subjects)
  const subjectStats = useMemo(() => {
    const acc = new Map(); // subject -> {present,onDuty,absent,total}
    for (const d of (rows || [])) {
      const dailyUnique = uniqueBySubject(d?.dailySchedule || []);
      for (const s of dailyUnique) {
        const subj = (s.subject || '').trim() || '(No Subject)';
        const curr = acc.get(subj) || { present: 0, onDuty: 0, absent: 0, total: 0 };
        curr.total += 1;
        if (s.status === 'PRESENT') curr.present += 1;
        else if (s.status === 'ON-DUTY') curr.onDuty += 1;
        else if (s.status === 'ABSENT') curr.absent += 1;
        acc.set(subj, curr);
      }
    }
    const items = [];
    for (const [subject, v] of acc.entries()) {
      const pct = v.total ? Math.round(((v.present + v.onDuty) / v.total) * 10000) / 100 : 0;
      items.push({ subject, ...v, pct });
    }
    items.sort((a, b) => a.subject.localeCompare(b.subject));
    return items;
  }, [rows]);

  // Range-aware class statistics (date/range + subject filter)
  // Dedup per day by subject, then cap daily count to 7
  const filteredTotals = useMemo(() => {
    let total = 0, present = 0, onDuty = 0, absent = 0;
    for (const d of (rows || [])) {
      const dailyAll = d?.dailySchedule || [];
      const dailyFiltered = subjectFilter
        ? dailyAll.filter(x => (x.subject || '').trim() === subjectFilter)
        : dailyAll;

      // Deduplicate by subject, then cap to 7 per day
      const bySubjectOnce = uniqueBySubject(dailyFiltered);
      const dailyCapped = bySubjectOnce.slice(0, 7);

      total += dailyCapped.length;
      present += dailyCapped.filter(x => x.status === 'PRESENT').length;
      onDuty += dailyCapped.filter(x => x.status === 'ON-DUTY').length;
      absent += dailyCapped.filter(x => x.status === 'ABSENT').length;
    }
    return { total, present, onDuty, absent };
  }, [rows, subjectFilter]);

  return (
    <div className="attendance-container">
      {/* Header */}
      <div className="attendance-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 className="attendance-title">My Attendance</h2>
            <p className="attendance-subtitle">Overall (all-time) summary and filtered views</p>
          </div>
          <div className="action-buttons">
            <button className="action-btn" onClick={loadAttendance} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="day-view" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="date-picker-container">
            <label>Mode</label>
            <select
              className="date-picker"
              value={useRange ? '1' : '0'}
              onChange={e => setUseRange(e.target.value === '1')}
            >
              <option value="1">Range</option>
              <option value="0">Single day</option>
            </select>
          </div>

          {!useRange ? (
            <div className="date-picker-container">
              <label>Date</label>
              <input className="date-picker" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          ) : (
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

          {/* Subject filter for daily table */}
          <div className="date-picker-container">
            <label>Subject</label>
            <select
              className="date-picker"
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
            >
              <option value="">All subjects</option>
              {subjectStats.map(s => (
                <option key={s.subject} value={s.subject}>{s.subject}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards and progress */}
      <div className="attendance-wrapper">
        <div className="main-grid">
          {/* Overall card (all-time) */}
          <div className="profile-card">
            <div className="profile-avatar">ME</div>
            <h2 className="profile-name"></h2>
            <p className="profile-email"></p>

            <div className="profile-stats">
              <h3 className="stats-title">Overall (All Time)</h3>

              <div className="main-progress">
                <CircularProgressbar
                  value={totals.pct}
                  text={`${totals.pct}%`}
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
                      value={totals.presentPct}
                      text={`${totals.presentPct}%`}
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
                      value={totals.onDutyPct}
                      text={`${totals.onDutyPct}%`}
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
                      value={totals.absentPct}
                      text={`${totals.absentPct}%`}
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
            </div>
          </div>

          {/* Class Statistics (based on current filter + subject filter) */}
          <div className="subjects-grid">
            <div className="subject-card">
              <h3 className="subject-title">
                Class Statistics {subjectFilter ? `(Filtered · ${subjectFilter})` : '(Filtered)'}
              </h3>
              <div className="class-stats">
                <div className="stat-item">
                  <span className="stat-number">{filteredTotals.total}</span>
                  <span className="stat-label">Total Classes</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">{filteredTotals.present}</span>
                  <span className="stat-label">Present</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">{filteredTotals.onDuty}</span>
                  <span className="stat-label">On-Duty</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">{filteredTotals.absent}</span>
                  <span className="stat-label">Absent</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <br />
        {/* Daily summary table (optionally filtered by subject) */}
        <h3 className="subject-title">Daily Attendance Summary Table</h3>
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
              {(rows || []).map(d => {
                const ds = new Date(d.date).toISOString().slice(0, 10);
                const dailyAll = d.dailySchedule || [];
                const dailyFiltered = subjectFilter
                  ? dailyAll.filter(x => (x.subject || '').trim() === subjectFilter)
                  : dailyAll;

                // Deduplicate per subject on that day, then cap to 7
                const bySubjectOnce = uniqueBySubject(dailyFiltered);
                const dailyCapped = bySubjectOnce.slice(0, 7);

                const present = dailyCapped.filter(x => x.status === 'PRESENT').length;
                const onDuty = dailyCapped.filter(x => x.status === 'ON-DUTY').length;
                const absent = dailyCapped.filter(x => x.status === 'ABSENT').length;
                const total = dailyCapped.length;
                return (
                  <tr key={d._id || ds}>
                    <td>{ds}</td>
                    <td>{present}</td>
                    <td>{onDuty}</td>
                    <td>{absent}</td>
                    <td>{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Subject-wise summary table (for current filter) */}
        <h3 className="subject-title">Daily Subject-Wise Attendance Summary Table</h3>
        <div className="table-wrapper" style={{ marginTop: 12 }}>
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Present</th>
                <th>On-Duty</th>
                <th>Absent</th>
                <th>Total</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {subjectStats.length === 0 ? (
                <tr><td colSpan={6} className="no-results">No subject data</td></tr>
              ) : subjectStats.map(it => (
                <tr key={it.subject}>
                  <td>{it.subject}</td>
                  <td>{it.present}</td>
                  <td>{it.onDuty}</td>
                  <td>{it.absent}</td>
                  <td>{it.total}</td>
                  <td>{it.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
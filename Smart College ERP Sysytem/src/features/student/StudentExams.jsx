import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../auth/api';
import '../faculty/FacultyAttendance.css';

const GRADE_COLORS = {
  'A+': '#22c55e', A: '#4ade80', 'B+': '#38bdf8', B: '#60a5fa',
  C: '#facc15', D: '#fb923c', F: '#ef4444'
};

export default function StudentExams() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.studentMarks();
      setItems(res.items || []);
    } catch (err) {
      setItems([]);
      setError(err.message || 'Failed to load marks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const semesters = useMemo(
    () => [...new Set(items.map(i => i.semester).filter(s => s != null))].sort((a, b) => a - b),
    [items]
  );

  const visible = useMemo(
    () => (semesterFilter ? items.filter(i => String(i.semester) === semesterFilter) : items),
    [items, semesterFilter]
  );

  const summary = useMemo(() => {
    if (!visible.length) return null;
    const totalSum = visible.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const passed = visible.filter(i => i.grade !== 'F').length;
    return {
      subjects: visible.length,
      average: (totalSum / visible.length).toFixed(1),
      passed
    };
  }, [visible]);

  return (
    <div className="attendance-container">
      <div className="attendance-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 className="attendance-title">My Exams &amp; Marks</h2>
            <p className="attendance-subtitle">Semester exam, assignment and practical marks entered by your faculty</p>
          </div>
          <div className="action-buttons">
            <button className="action-btn" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="day-view" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="date-picker-container">
            <label>Semester</label>
            <select className="date-picker" value={semesterFilter} onChange={e => setSemesterFilter(e.target.value)}>
              <option value="">All semesters</option>
              {semesters.map(s => (
                <option key={s} value={String(s)}>Semester {s}</option>
              ))}
            </select>
          </div>
          {summary && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><strong>{summary.subjects}</strong> subjects</span>
              <span>Average total: <strong>{summary.average}/100</strong></span>
              <span>Passed: <strong>{summary.passed}/{summary.subjects}</strong></span>
            </div>
          )}
        </div>

        {error && <p style={{ color: '#ef4444', marginTop: 12 }}>{error}</p>}

        <div className="table-wrapper" style={{ marginTop: 12 }}>
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Semester</th>
                <th>Semester Exam (60)</th>
                <th>Assignment (20)</th>
                <th>Practical (20)</th>
                <th>Total (100)</th>
                <th>Grade</th>
                <th>Faculty</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => (
                <tr key={m._id}>
                  <td>{m.courseName}{m.courseCode ? ` (${m.courseCode})` : ''}</td>
                  <td>{m.semester ?? '-'}</td>
                  <td>{m.semesterExam}</td>
                  <td>{m.assignment}</td>
                  <td>{m.practical}</td>
                  <td><strong>{m.total}</strong></td>
                  <td>
                    <span style={{ color: GRADE_COLORS[m.grade] || 'inherit', fontWeight: 700 }}>{m.grade}</span>
                  </td>
                  <td>{m.facultyName}</td>
                  <td>{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
              {!visible.length && !loading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', opacity: 0.7 }}>No marks published yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

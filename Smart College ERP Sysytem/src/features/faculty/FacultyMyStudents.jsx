// src/features/faculty/FacultyMyStudents.jsx
import React, { useEffect, useMemo, useState } from 'react';
import "../admin/AdminCourses.css";
import { api } from '../../auth/api';

export default function FacultyMyStudents() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState({ courses: true, students: false, risk: false });
  const [err, setErr] = useState('');

  // Tab: 'roster' or 'risk'
  const [activeTab, setActiveTab] = useState('roster');
  const [riskData, setRiskData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setErr('');
        const res = await api.facultyCourses(); // GET /faculty/attendance/courses
        const items = Array.isArray(res?.items) ? res.items : [];
        setCourses(items);
        if (items.length) setCourseId(items[0]._id);
      } catch (e) {
        setErr(e.message || 'Failed to load courses');
      } finally {
        setLoading(l => ({ ...l, courses: false }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!courseId) {
      setStudents([]);
      setRiskData(null);
      return;
    }
    (async () => {
      try {
        setErr('');
        setLoading(l => ({ ...l, students: true, risk: true }));
        const [resStudents, resRisk] = await Promise.all([
          api.facultyCourseStudents(courseId),
          api.facultyCourseAcademicRisk(courseId).catch(() => null)
        ]);
        const items = Array.isArray(resStudents?.items) ? resStudents.items : [];
        setStudents(items);
        setRiskData(resRisk);
      } catch (e) {
        setErr(e.message || 'Failed to load students');
      } finally {
        setLoading(l => ({ ...l, students: false, risk: false }));
      }
    })();
  }, [courseId]);

  const titleCourse = useMemo(
    () => courses.find(c => String(c._id) === String(courseId)),
    [courses, courseId]
  );
  const total = students.length;

  if (loading.courses) return <div><p>Loading…</p></div>;

  return (
    <div className="admin-dark courses-page">
      <div className="page-head">
        <div className="page-title">
          <h1>My Students & Academic Monitoring</h1>
          <p>
            {titleCourse
              ? `${titleCourse.name} • Sem ${titleCourse.semester || '-'} • Sec ${titleCourse.section || '-'}`
              : 'Select a course to view students'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ color: '#cbd5e1' }}>Course</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="admin-input"
          >
            {courses.map(c => (
              <option key={c._id} value={c._id}>
                {c.name} {c.section ? `(${c.section})` : ''} • Sem {c.semester ?? '-'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}

      {/* VIEW SELECTOR TABS */}
      <div style={{ display: 'flex', gap: 10, margin: '16px 0 20px 0' }}>
        <button
          type="button"
          className="btn"
          style={{
            background: activeTab === 'roster' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: 'none',
            padding: '8px 18px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 600
          }}
          onClick={() => setActiveTab('roster')}
        >
          📋 Standard Roster ({total})
        </button>
        <button
          type="button"
          className="btn"
          style={{
            background: activeTab === 'risk' ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: 'none',
            padding: '8px 18px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          onClick={() => setActiveTab('risk')}
        >
          <span>🚨</span> Early Warning & Academic Risk ({riskData?.atRiskCount || 0} At Risk)
        </button>
      </div>

      {/* ACADEMIC RISK RADAR TAB */}
      {activeTab === 'risk' && (
        <div style={{ marginBottom: 20 }}>
          {riskData?.atRiskCount > 0 ? (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 16,
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}>
              <span style={{ fontSize: '1.8rem' }}>⚠️</span>
              <div>
                <strong style={{ color: '#fff', fontSize: '1rem' }}>
                  Attention Required: {riskData.atRiskCount} Student(s) at Academic Risk
                </strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem' }}>
                  These students have combined risk factors (attendance &lt; 75%, low assessment scores, or missing coursework) and require academic intervention before semester examinations.
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid #10b981',
              borderRadius: 12,
              padding: '14px 20px',
              marginBottom: 16,
              color: '#6ee7b7'
            }}>
              ✅ All enrolled students in this course are maintaining optimal academic standing.
            </div>
          )}

          <div className="courses-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll / Reg No</th>
                  <th>Attendance</th>
                  <th>Marks (100)</th>
                  <th>Risk Level</th>
                  <th>AI Remediation & Insights</th>
                </tr>
              </thead>
              <tbody>
                {loading.risk ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                      Computing multi-factor academic risk scores…
                    </td>
                  </tr>
                ) : (!riskData?.roster || riskData.roster.length === 0) ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                      No student risk records available
                    </td>
                  </tr>
                ) : (
                  riskData.roster.map(r => (
                    <tr key={r.studentId} style={{ background: r.risk.level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                      <td data-col="Student">
                        <strong>{r.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.email}</div>
                      </td>
                      <td data-col="Roll No">{r.rollNo}</td>
                      <td data-col="Attendance">
                        <strong style={{ color: r.attendance < 75 ? '#ef4444' : '#10b981' }}>
                          {r.attendance}%
                        </strong>
                      </td>
                      <td data-col="Marks">{r.marks > 0 ? `${r.marks}/100` : 'Not Entered'}</td>
                      <td data-col="Risk Level">
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: `${r.risk.badgeColor}22`,
                            color: r.risk.badgeColor,
                            border: `1px solid ${r.risk.badgeColor}55`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {r.risk.level}
                        </span>
                      </td>
                      <td data-col="Insights" style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                        {(r.risk.recommendations || []).slice(0, 2).join(' • ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STANDARD ROSTER TAB */}
      {activeTab === 'roster' && (
        <div className="courses-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Email</th>
                <th>Roll No</th>
                <th>Register No</th>
                <th>Branch</th>
                <th>Section</th>
                <th>Semester</th>
              </tr>
            </thead>
            <tbody>
              {loading.students ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                    Loading students…
                  </td>
                </tr>
              ) : total === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                    No students match this course’s semester/section/department
                  </td>
                </tr>
              ) : students.map((it, idx) => {
                const u = it.user || {};
                const p = it.profile || {};
                const fullName =
                  u.name ||
                  [p.firstName, p.lastName].filter(Boolean).join(' ') ||
                  '-';
                return (
                  <tr key={u._id || idx}>
                    <td data-col="Number">{idx + 1}</td>
                    <td data-col="Name">{fullName}</td>
                    <td data-col="Email">{u.email || '-'}</td>
                    <td data-col="Roll No">{p.rollNo || '-'}</td>
                    <td data-col="Register No">{p.registerNumber || '-'}</td>
                    <td data-col="Branch">{p.branch || '-'}</td>
                    <td data-col="Section">{p.section || '-'}</td>
                    <td data-col="Semester">{p.semester ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading.students && (
            <div style={{ marginTop: 8, color: '#94a3b8' }}>
              Total students: {total}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// src/features/faculty/FacultyMyStudents.jsx
import React, { useEffect, useMemo, useState } from 'react';
import "../admin/AdminCourses.css";
import { api } from '../../auth/api';

export default function FacultyMyStudents() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState({ courses: true, students: false });
  const [err, setErr] = useState('');

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
      return;
    }
    (async () => {
      try {
        setErr('');
        setLoading(l => ({ ...l, students: true }));
        const res = await api.facultyCourseStudents(courseId); // GET /faculty/attendance/students?courseId=...
        const items = Array.isArray(res?.items) ? res.items : [];
        setStudents(items);
      } catch (e) {
        setErr(e.message || 'Failed to load students');
      } finally {
        setLoading(l => ({ ...l, students: false }));
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
          <h1>My Students</h1>
          <p>
            {titleCourse
              ? `${titleCourse.name} • Sem ${titleCourse.semester || '-'} • Sec ${titleCourse.section || '-'}`
              : 'Select a course to view students'}
          </p>
        </div>
        <div>
          <label style={{ color: '#cbd5e1', marginRight: 8 }}>Course</label>
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

      {err && <div className="form-error" style={{ marginBottom:12 }}>{err}</div>}

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
                <td colSpan={8} style={{ textAlign:'center', padding:16, color:'#94a3b8' }}>
                  Loading students…
                </td>
              </tr>
            ) : total === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign:'center', padding:16, color:'#94a3b8' }}>
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
    </div>
  );
}
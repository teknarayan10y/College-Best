import React, { useEffect, useState } from 'react';
import "../admin/AdminCourses.css";
import { api } from '../../auth/api';

export default function FacultyMySubjects() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setErr('');
        const res = await api.facultyMyCourses();
        const items = Array.isArray(res?.courses) ? res.courses : [];
        setRows(items);
      } catch (e) {
        setErr(e.message || 'Failed to load courses');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div><p>Loading…</p></div>;

  return (
    <div className="admin-dark courses-page">
      <div className="page-head">
        <div className="page-title">
          <h1>My Subjects</h1>
          <p>Courses assigned to you</p>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom:12 }}>{err}</div>}

      <div className="courses-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Dept</th>
              <th>Section</th>
              <th>Sem</th>
              <th>Credits</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign:'center', padding:16, color:'#94a3b8' }}>
                  No subjects assigned
                </td>
              </tr>
            ) : rows.map(c => (
              <tr key={c._id}>
                <td data-col="Code">{c.code}</td>
                <td data-col="Name">{c.name}</td>
                <td data-col="Dept">{c.department || '-'}</td>
                <td data-col="Section">{c.section || '-'}</td>
                <td data-col="Sem">{c.semester ?? '-'}</td>
                <td data-col="Credits">{c.credits ?? '-'}</td>
                <td data-col="Status">
                  <span className={`badge ${c.isActive ? 'success' : 'muted'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
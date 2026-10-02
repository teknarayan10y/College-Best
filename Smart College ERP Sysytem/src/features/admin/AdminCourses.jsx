// src/features/admin/AdminCourses.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "./AdminCourses.css";
import { api } from '../../auth/api';

export default function AdminCourses() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    try {
      setErr('');
      const res = await api.adminCourses();
      let items = [];
      if (Array.isArray(res)) {
        items = res;
      } else if (Array.isArray(res.courses)) {
        items = res.courses;
      } else if (Array.isArray(res.items)) {
        items = res.items;
      }
      setRows(items);
    } catch (e) {
      setErr(e.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (course) => {
    if (!confirm(`Delete course ${course.code || course.name}?`)) return;
    try {
      await api.adminDeleteCourse(course._id);
      setRows(prev => prev.filter(x => x._id !== course._id));
    } catch (e) {
      alert(e.message || 'Failed to delete course');
    }
  };

  if (loading) return <div className="admin-dark courses-page"><p>Loading…</p></div>;

  return (
    <div className="admin-dark courses-page">
      <div className="page-head">
        <div className="page-title">
          <h1>Courses</h1>
          <p>Manage course catalog across departments and semesters</p>
        </div>
        <div className="courses-actions">
          <button className="btn" onClick={() => navigate('/admin/courses/create')}>
            Create Course
          </button>
          <button className="btn ghost" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}

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
              <th>Faculty</th>
              <th>Active</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                  No courses
                </td>
              </tr>
            ) : rows.map((c) => (
              <tr key={c._id}>
                <td data-col="Code">{c.code}</td>
                <td data-col="Name">{c.name}</td>
                <td data-col="Dept">{c.department || '-'}</td>
                <td data-col="Section">{c.section || '-'}</td>
                <td data-col="Sem">{c.semester ?? '-'}</td>
                <td data-col="Credits">{c.credits ?? '-'}</td>

                <td data-col="Faculty">
                  {c.facultyName
                    ? (c.facultyId ? (
                        <button
                          className="btn ghost"
                          onClick={() => navigate(`/admin/faculty/${c.facultyId}`)}
                          title="Open faculty profile"
                        >
                          {c.facultyName}
                        </button>
                      ) : (
                        c.facultyName
                      ))
                    : (typeof c.faculty === 'string' && c.faculty.trim()
                        ? c.faculty  // legacy fallback when old rows stored name in faculty
                        : '-')}
                </td>

                <td data-col="Active">
                  <span className={`badge ${c.isActive ? 'success' : 'muted'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>

                <td data-col="Action">
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      className="btn ghost"
                      onClick={() => navigate(`/admin/courses/${c._id}/edit`)}
                      title="Edit course"
                    >
                      Edit
                    </button>
                    <button className="btn" onClick={() => handleDelete(c)} title="Delete course">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
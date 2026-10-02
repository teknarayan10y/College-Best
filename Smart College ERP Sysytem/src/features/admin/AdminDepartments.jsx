import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../auth/api';
 import './AdminCourses.css';

export default function AdminDepartments() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const res = await api.adminDepartments(q ? { q } : {});
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // initial



// ...
return (
  <div className="admin-dark admin-departments courses-page">
    <header className="page-head">
      <div className="page-title">
        <h1>Departments</h1>
        <p>Manage departments</p>
      </div>
      <div className="courses-actions">
        <div className="search">
          <input
            className="input"
            placeholder="Search by name or code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn" onClick={load} disabled={loading}>Search</button>
        <Link to="/admin/departments/create" className="btn">Create</Link>
      </div>
    </header>
    <div className="courses-card">
      {loading ? <p>Loading...</p> : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th className="right"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(d => (
              <tr key={d._id}>
                <td data-col="Code">{d.code}</td>
                <td data-col="Name">{d.name}</td>
                <td data-col="Status">
                  <span className={`badge ${d.isActive ? 'success' : 'muted'}`}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="right" data-col="">
                  <button
                    className="btn ghost"
                    onClick={() => navigate(`/admin/departments/${d._id}/edit`)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="muted">No departments found</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  </div>
);
}
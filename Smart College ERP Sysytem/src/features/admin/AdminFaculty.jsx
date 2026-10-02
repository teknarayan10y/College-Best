import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../auth/api";
import "./AdminFaculty.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function AdminFaculty() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // NEW: department filter
  const [department, setDepartment] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const res = await api.adminFaculty();
        setRows(res.faculty || []);
      } catch (e) {
        setErr(e.message || "Failed to load faculty");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Unique department options
  const departmentOptions = useMemo(() => {
    const set = new Set(
      rows.map((f) => (f?.department || "").trim()).filter(Boolean)
    );
    return ["", ...Array.from(set).sort()];
  }, [rows]);

  // Filtered rows by selected department
  const filteredRows = useMemo(() => {
    if (!department) return rows;
    return rows.filter(
      (f) => (f?.department || "").toLowerCase() === department.toLowerCase()
    );
  }, [rows, department]);

  if (loading) return <div className="admin-faculty"><p>Loading…</p></div>;

  return (
    <div className="admin-faculty">
      <h1>Faculty</h1>
      {err && <div className="form-error">{err}</div>}

      {/* Filter Bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ color: "#94a3b8", fontSize: 14 }}>
          Department:
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{
              marginLeft: 8,
              background: "#111827",
              color: "#e5e7eb",
              border: "1px solid #1f2937",
              padding: "6px 10px",
              borderRadius: 6
            }}
          >
            {departmentOptions.map((d, i) => (
              <option key={i} value={d}>
                {d || "All"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Photo</th>
            <th>Faculty ID</th>
            <th>Name</th>
            <th>Department</th>
            <th>Designation</th>
            <th>Email</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center" }}>No faculty found.</td>
            </tr>
          ) : (
            filteredRows.map((f) => {
              const photo = toAbsoluteUploadUrl(f.profileImage);
              return (
                <tr key={f.userId}>
                  <td>
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: "50%" }}
                        onError={(e) => { e.currentTarget.src = "/avatar-placeholder.png"; }}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{f.facultyId || "-"}</td>
                  <td
                    className="clickable"
                    onClick={() => navigate(`/admin/faculty/${f.userId}`)}
                  >
                    {f.name}
                  </td>
                  <td>{f.department || "-"}</td>
                  <td>{f.designation || "-"}</td>
                  <td>{f.email}</td>
                  <td>
                    <span className={`status ${f.isActive ? "active" : "inactive"}`}>
                      {f.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn ghost"
                      onClick={() => navigate(`/admin/faculty/${f.userId}`)}
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
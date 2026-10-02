// src/features/admin/AdminStudents.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../auth/api";
import "./AdminStudents.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function AdminStudents() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // NEW: branch filter
  const [branch, setBranch] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const res = await api.adminStudents();
        const items = Array.isArray(res.items) ? res.items : [];
        setRows(items);
      } catch (e) {
        setErr(e.message || "Failed to load students");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Unique branch list for dropdown
  const branchOptions = useMemo(() => {
    const set = new Set(
      rows
        .map((r) => (r?.profile?.branch || "").trim())
        .filter(Boolean)
    );
    return ["", ...Array.from(set).sort()];
  }, [rows]);

  // Filtered rows by selected branch
  const filteredRows = useMemo(() => {
    if (!branch) return rows;
    return rows.filter(
      (r) => (r?.profile?.branch || "").toLowerCase() === branch.toLowerCase()
    );
  }, [rows, branch]);

  if (loading) return <div className="admin-students"><p>Loading…</p></div>;

  return (
    <div className="admin-students">
      <h1>Students</h1>
      {err && <div className="form-error">{err}</div>}

      {/* Filter Bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ color: "#94a3b8", fontSize: 14 }}>
          Branch:
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            style={{
              marginLeft: 8,
              background: "#111827",
              color: "#e5e7eb",
              border: "1px solid #1f2937",
              padding: "6px 10px",
              borderRadius: 6
            }}
          >
            {branchOptions.map((b, i) => (
              <option key={i} value={b}>
                {b || "All"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Photo</th>
            <th>Student ID</th>
            <th>Name</th>
            <th>Branch</th>
            <th>Semester</th>
            <th>Email</th>
            <th>Resume</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center" }}>
                No students found.
              </td>
            </tr>
          ) : (
            filteredRows.map(({ user, profile }) => {
              const userId = user?._id;
              const img = toAbsoluteUploadUrl(profile?.profileImage);
              const name =
                [user?.firstName || profile?.firstName, user?.lastName || profile?.lastName]
                  .filter(Boolean)
                  .join(" ") || "-";
              return (
                <tr key={userId}>
                  <td>
                    {img ? (
                      <img
                        src={img}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                        onError={(e) => {
                          e.currentTarget.src = "/avatar-placeholder.png";
                        }}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{profile?.studentId || "-"}</td>
                  <td
                    className="clickable"
                    onClick={() => navigate(`/admin/students/${userId}`)}
                  >
                    {name}
                  </td>
                  <td>{profile?.branch || "-"}</td>
                  <td>{profile?.semester || "-"}</td>
                  <td>{user?.email || profile?.email || "-"}</td>
                  <td>
                    {profile?.resumeLink ? (
                      <a href={profile.resumeLink} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                      className="btn ghost"
                      onClick={() => navigate(`/admin/students/${userId}`)}
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
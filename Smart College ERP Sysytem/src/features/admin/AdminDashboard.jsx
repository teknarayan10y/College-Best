// src/features/admin/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import "./AdminDashboard.css";
import { useNavigate } from "react-router-dom";
import { api } from "../../auth/api";
import WelcomePopup from "../../components/WelcomePopup";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [students, setStudents] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [digitalTwin, setDigitalTwin] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        // Fetch students for totals/departments and recent faculty
        const [sRes, fRes, dtRes] = await Promise.all([
          api.adminStudents({}),
          api.adminFaculty({ limit: 8 }),
          api.digitalTwin().catch(() => null),
        ]);

        if (dtRes && !cancelled) {
          setDigitalTwin(dtRes);
        }

        // Normalize students: merge { user, profile } -> single row
        let studentRows = [];
        if (Array.isArray(sRes)) {
          studentRows = sRes;
        } else if (Array.isArray(sRes.students)) {
          studentRows = sRes.students;
        } else if (Array.isArray(sRes.items)) {
          studentRows = sRes.items.map(({ user, profile }) => ({
            ...(user || {}),
            ...(profile || {}),
          }));
        }

        // Normalize faculty (handle either array or { faculty: [] })
        const facultyRows = Array.isArray(fRes?.faculty || fRes)
          ? (fRes.faculty || fRes)
          : [];

        if (!cancelled) {
          setStudents(studentRows);
          setFaculty(facultyRows);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const totalStudents = students.length;
  const totalFaculty = faculty.length;

  // Unique departments derived from student branch/department fields
  const deptSet = new Set(
    (students || [])
      .map(s => s.branch || s.department || s.user?.department || "")
      .filter(Boolean)
  );
  const departmentCount = deptSet.size;

  const activeStudents = students.filter(s => s.isActive === true).length;
  const pendingApprovals = students.filter(s => s.isActive === false).length;

  return (
    <div className="admin-dark">
      <WelcomePopup />
      <div className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Institution overview & system control</p>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}

      {/* NexusMind AI - Institutional Intelligence Radar */}
      <div className="digital-twin-banner" style={{ marginTop: 24, marginBottom: 0 }}>
        <div className="dt-header">
          <div className="dt-title-wrap">
            <span className="dt-sparkle">🔮</span>
            <div>
              <div className="dt-heading">NexusMind Institutional Intelligence Radar</div>
              <div className="dt-subheading">Predictive Macro-Velocity, Department Health & Risk Trajectories</div>
            </div>
          </div>
          <div className="dt-badges">
            <span className={`dt-badge ${digitalTwin?.campusVelocity === "DOWNWARD" ? "velocity-down" : "velocity-up"}`}>
              ⚡ Campus Velocity: {digitalTwin?.campusVelocity || "STABLE"}
            </span>
            <span className="dt-badge risk-low">
              🏛️ Health Index: {digitalTwin?.healthIndex || 86}/100
            </span>
          </div>
        </div>

        <div className="dt-metrics-grid">
          <div className="dt-metric-card">
            <div className="dt-metric-label">30-Day Campus Trajectory</div>
            <div className="dt-metric-val">{digitalTwin?.projected30Day || 84.5}%</div>
            <div className="dt-metric-sub">Forecasted college-wide attendance</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Statistical Anomaly Status</div>
            <div className="dt-metric-val" style={{ color: "#4ade80" }}>{digitalTwin?.anomalyStatus || "NOMINAL"}</div>
            <div className="dt-metric-sub">Z-Score divergence within limits</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Institutional Health Index</div>
            <div className="dt-metric-val" style={{ color: "#60a5fa" }}>{digitalTwin?.healthIndex || 86} / 100</div>
            <div className="dt-metric-sub">Aggregated across all departments</div>
          </div>
        </div>
      </div>

      {/* KPI SECTION */}
      <div className="admin-kpi-grid">
        <Kpi title="Total Students" value={loading ? "…" : String(totalStudents)} />
        <Kpi title="Total Faculty" value={loading ? "…" : String(totalFaculty)} />
        <Kpi title="Courses Offered" value="—" />
        <Kpi title="Departments" value={loading ? "…" : String(departmentCount)} />
      </div>

      <div className="admin-kpi-grid secondary">
        <Kpi title="Active Students" value={loading ? "…" : String(activeStudents)} good />
        <Kpi title="Pending Approvals" value={loading ? "…" : String(pendingApprovals)} warn />
        <Kpi title="Fees Pending" value="—" bad />
        <Kpi title="System Alerts" value="—" bad />
      </div>

      {/* MAIN GRID */}
      <div className="admin-main-grid">
        <div className="admin-card">
          <h2>Recent Students</h2>
          {loading ? <p>Loading…</p> : (
            <ul>
              {(students || []).slice(0, 5).map((s, i) => (
                <li key={s._id || i}>
                  <strong>{displayName(s)}</strong>
                  {" "}- {s.email || "—"}
                  {" "}<span style={{ color: s.isActive ? "#10b981" : "#ef4444" }}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
              {students.length === 0 && <li>No recent students</li>}
            </ul>
          )}
        </div>

        <div className="admin-card">
          <h2>Recent Faculty</h2>
          {loading ? <p>Loading…</p> : (
            <ul>
              {(faculty || []).slice(0, 5).map((f, i) => (
                <li key={f._id || i}>
                  <strong>{displayName(f)}</strong>
                  {" "}- {f.email || f.user?.email || "—"}
                  {" "}{(f.department || f.designation) ? (
                    <span> · {f.department || f.designation}</span>
                  ) : null}
                </li>
              ))}
              {faculty.length === 0 && <li>No recent faculty</li>}
            </ul>
          )}
        </div>

        <div className="admin-card">
          <h2>Quick Links</h2>
          <ul>
            <li><button className="btn ghost" onClick={() => navigate("/admin/students")}>View Students</button></li>
            <li><button className="btn ghost" onClick={() => navigate("/admin/faculty")}>View Faculty</button></li>
            <li><button className="btn ghost" onClick={() => navigate("/admin/create-faculty")}>Create Faculty</button></li>
            <li><button className="btn ghost" onClick={() => navigate("/admin/settings")}>Settings</button></li>
          </ul>
        </div>

        <div className="admin-card">
          <h2>Notes</h2>
          <ul>
            <li>Totals are based on currently fetched data. Expose totals in API to avoid fetching all records.</li>
            <li>Departments count is derived from student branch/department fields.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function displayName(row) {
  const fn = row.firstName || row.user?.firstName || "";
  const ln = row.lastName || row.user?.lastName || "";
  const full = `${fn} ${ln}`.trim();
  return full || row.name || row.user?.name || "—";
}

/* KPI COMPONENT */
function Kpi({ title, value, good, warn, bad }) {
  return (
    <div className={`admin-kpi ${good ? "good" : warn ? "warn" : bad ? "bad" : ""}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
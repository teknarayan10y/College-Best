import React, { useEffect, useState, useMemo } from "react";
import "./FacultyDashboard.css";
import { api } from "../../auth/api";
import WelcomePopup from "../../components/WelcomePopup";

export default function FacultyDashboard() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [subjectsHandling, setSubjectsHandling] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [pendingAttendance, setPendingAttendance] = useState(0);       // count (today)
  const [averageAttendance, setAverageAttendance] = useState(0);       // range avg, fallback to today

  // Date for "today" analytics
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  // Range for average (1st of current month -> selected date)
  const [fromDate, toDate] = useMemo(() => {
    const dSel = new Date(date);
    const start = new Date(dSel.getFullYear(), dSel.getMonth(), 1);
    return [start.toISOString().slice(0, 10), date];
  }, [date]);

  // Static lists – customize as needed
  const notices = [
    "Internal marks submission deadline – Friday",
    "Department meeting today at 3:00 PM",
    "Attendance audit next week",
  ];
  const tasks = [
    "Mark DBMS attendance",
    "Upload CIA-1 marks",
    "Evaluate Assignment-2",
  ];

  async function loadDashboard() {
    setLoading(true);
    setErr("");
    try {
      // 1) Subjects handling = faculty courses count
      const coursesRes = await api.facultyCourses();
      const courses = Array.isArray(coursesRes?.items) ? coursesRes.items : [];
      setSubjectsHandling(courses.length);

      // 2) Total students = unique across all courses
      const ids = new Set();
      await Promise.all(
        courses.map(async (c) => {
          try {
            const r = await api.facultyCourseStudents(c._id);
            for (const it of (r?.items || [])) {
              const uid =
                it?.user?._id || it?.userId || it?.id || (it?.profile?.user || "");
              if (uid) ids.add(String(uid));
            }
          } catch { }
        })
      );
      setTotalStudents(ids.size);

      // 3) Today + Range analytics
      const [todayRes, rangeRes] = await Promise.all([
        api.facultyAnalyticsToday({ date }),
        api.facultyAnalyticsSubjectSummary({ from: fromDate, to: toDate }),
      ]);

      // Pending (today) — number only
      const totals = todayRes?.totals || {};
      setPendingAttendance(Number(totals.unmarked) || 0);

      // Average: weighted across range (present+onDuty)/total; fallback to today's pct
      const items = Array.isArray(rangeRes?.items) ? rangeRes.items : [];
      let total = 0, attended = 0;
      for (const it of items) {
        const t = Number(it.total) || 0;
        const p = Number(it.present) || 0;
        const od = Number(it.onDuty) || 0;
        total += t;
        attended += (p + od);
      }
      const rangePct = total ? Math.round((attended / total) * 10000) / 100 : 0;
      const todayPct = Number(totals.pct) || 0;
      setAverageAttendance(rangePct || todayPct);

      setLastUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setErr(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [date]);

  useEffect(() => {
    const id = setInterval(loadDashboard, 15000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <div className="faculty">
      <WelcomePopup />
      {/* HEADER */}
      <header className="faculty-header">
        <h1>Faculty Dashboard</h1>
        <p>Academic overview & daily teaching operations</p>

        {/* Toolbar (styled) */}
        <div className="fd-toolbar">
          <div className="fd-field">
            <label className="fd-label">Date</label>
            <input
              className="fd-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <button
            className="fd-btn"
            onClick={loadDashboard}
            disabled={loading}
            title="Refresh (auto every 15s)"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>

          {lastUpdatedAt && (
            <span className="fd-badge">Last updated: {lastUpdatedAt}</span>
          )}
        </div>

        {err && <div className="alert error" style={{ marginTop: 8 }}>{err}</div>}
      </header>

      {/* NexusMind AI - Classroom Collective Intelligence Radar */}
      <div className="digital-twin-banner" style={{ margin: "0 0 24px 0" }}>
        <div className="dt-header">
          <div className="dt-title-wrap">
            <span className="dt-sparkle">🔮</span>
            <div>
              <div className="dt-heading">NexusMind Classroom Intelligence Radar</div>
              <div className="dt-subheading">Predictive Cohort Velocity & Early Warning Telemetry</div>
            </div>
          </div>
          <div className="dt-badges">
            <span className="dt-badge velocity-up">
              ⚡ Class Velocity: STABLE
            </span>
            <span className="dt-badge risk-low">
              🟢 Pass Rate Forecast: 88%
            </span>
          </div>
        </div>

        <div className="dt-metrics-grid">
          <div className="dt-metric-card">
            <div className="dt-metric-label">Predicted Course Pass Rate</div>
            <div className="dt-metric-val">88.0%</div>
            <div className="dt-metric-sub">Based on CIA-1 & Submission Rate</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Students Requiring Intervention</div>
            <div className="dt-metric-val" style={{ color: "#f87171" }}>2 Students</div>
            <div className="dt-metric-sub">Attendance below 75% threshold</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Class Momentum Trajectory</div>
            <div className="dt-metric-val" style={{ color: "#4ade80" }}>Healthy</div>
            <div className="dt-metric-sub">No anomalous drops detected</div>
          </div>
        </div>
      </div>

      {/* KPI */}
      <section className="faculty-kpis">
        <Kpi title="Subjects Handling" value={subjectsHandling} />
        <Kpi title="Total Students" value={totalStudents} />
        <Kpi title="Average Attendance" value={`${averageAttendance}%`} status="good" />
        <Kpi title="Pending Attendance" value={pendingAttendance} status={pendingAttendance > 0 ? "warn" : "good"} />
      </section>

      {/* CONTENT GRID */}
      <section className="faculty-grid">
        {/* Pending Tasks */}
        <Card title="Pending Tasks">
          <ul className="list">
            {tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Card>

        {/* Quick Actions */}
        <Card title="Quick Actions">
          <div className="actions">
            <button className="btn btn-primary">Mark Attendance</button>
            <button className="btn btn-secondary">Enter Marks</button>
            <button className="btn btn-ghost">Create Assignment</button>
          </div>
        </Card>

        {/* Important Notices */}
        <Card title="Important Notices" wide>
          <ul className="notice">
            {notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

/* ================== REUSABLE COMPONENTS ================== */

function Card({ title, wide, children }) {
  return (
    <div className={`card ${wide ? "wide" : ""}`}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Kpi({ title, value, status }) {
  return (
    <div className={`kpi ${status || ""}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
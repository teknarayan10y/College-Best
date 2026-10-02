import React, { useEffect, useMemo, useState } from "react";
import "./StudentDashboard.css";
import { api } from "../../auth/api";
import WelcomePopup from "../../components/WelcomePopup";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [twin, setTwin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const demo = useMemo(() => ({
    stats: {
      cgpa: 8.52,
      attendance: 91,
      totalSubjects: 6,
      pendingAssignments: 2,
    },
  }), []);

  useEffect(() => {
    (async () => {
      try {
        const [res, dt] = await Promise.all([
          api.studentData().catch(() => null),
          api.digitalTwin().catch(() => null)
        ]);
        if (res) setData(res);
        if (dt) setTwin(dt);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = data?.stats || demo.stats;
  const velocity = twin?.velocity || 'STABLE';
  const projected = twin?.projected30Day || stats.attendance || 85;
  const health = twin?.academicHealthScore || 90;
  const risk = twin?.riskLevel || 'LOW';

  if (loading) return <div>Loading...</div>;
  if (err) return <div>{err}</div>;

  return (
    <>
      <WelcomePopup />
      {/* NexusMind AI - Personal Digital Twin Telemetry Card */}
      <div className="digital-twin-banner">
        <div className="dt-header">
          <div className="dt-title-wrap">
            <span className="dt-sparkle">🔮</span>
            <div>
              <div className="dt-heading">NexusMind Personal Digital Twin</div>
              <div className="dt-subheading">Live AI Predictive Telemetry & Trajectory</div>
            </div>
          </div>
          <div className="dt-badges">
            <span className={`dt-badge velocity-${velocity.toLowerCase()}`}>
              {velocity === 'UPWARD' ? '⚡ Velocity: UPWARD' : (velocity === 'DOWNWARD' ? '🔻 Velocity: DOWNWARD' : '➡️ Velocity: STABLE')}
            </span>
            <span className={`dt-badge risk-${risk.toLowerCase()}`}>
              {risk === 'LOW' ? '🟢 Optimal Performance' : '⚠️ Attention Required'}
            </span>
          </div>
        </div>

        <div className="dt-metrics-grid">
          <div className="dt-metric-card">
            <div className="dt-metric-label">30-Day Projected Attendance</div>
            <div className="dt-metric-val">{projected}%</div>
            <div className="dt-metric-sub">{projected >= 75 ? 'Safe / Exam Eligible' : 'Shortage Projected'}</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Academic Health Score</div>
            <div className="dt-metric-val">{health} / 100</div>
            <div className="dt-metric-sub">Calculated via Multivariable ML</div>
          </div>
          <div className="dt-metric-card">
            <div className="dt-metric-label">Safe-to-Miss Margin</div>
            <div className="dt-metric-val">{twin?.safeToMiss !== undefined ? twin.safeToMiss : 2} Classes</div>
            <div className="dt-metric-sub">Buffer remaining above 75%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-4 summary-cards">
        <SummaryCard title="Total Subjects" value={stats.totalSubjects} icon="📚" />
        <SummaryCard title="Attendance" value={`${stats.attendance}%`} icon="📊" />
        <SummaryCard title="Pending Assignments" value={stats.pendingAssignments} icon="📝" />
        <SummaryCard title="CGPA" value={stats.cgpa} icon="🎓" />
      </div>
    </>
  );
}

function SummaryCard({ title, value, icon }) {
  return (
    <div className="card summary">
      <div className="summary-icon">{icon}</div>
      <div>
        <span className="summary-title">{title}</span>
        <h2 className="summary-value">{value}</h2>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../../auth/api';
import './StudentAcademicRisk.css';

export default function StudentAcademicRisk() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRiskReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.studentAcademicRisk();
      setData(res);
    } catch (err) {
      console.error(err);
      setError('Failed to calculate academic performance risk analysis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRiskReport();
  }, []);

  if (loading) {
    return (
      <div className="academic-risk-container" style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚡</div>
        <h3>Evaluating Academic Multi-Factor Risk Index...</h3>
        <p>Synthesizing attendance trends, assessment marks, assignments, and academic health.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="academic-risk-container">
        <div className="alert error" style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '16px', borderRadius: '12px' }}>
          {error || 'No academic risk records found.'}
          <button type="button" onClick={loadRiskReport} style={{ marginLeft: '12px', background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { overallAcademicHealth, overallLevel, subjects = [] } = data;

  const getOverallColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MODERATE': return '#eab308';
      default: return '#10b981';
    }
  };

  return (
    <div className="academic-risk-container">
      {/* HERO SECTION */}
      <div className="risk-hero">
        <div className="risk-hero-title">
          <h2>
            <span>📊</span> Academic Performance Risk Analysis
          </h2>
          <p>
            Multi-factor evaluation per subject integrating attendance, assessment marks, coursework, and cumulative academic history.
          </p>
        </div>

        <div className="risk-overall-scorecard">
          <div
            className="risk-score-circle"
            style={{
              background: `radial-gradient(circle, ${getOverallColor(overallLevel)}22 0%, ${getOverallColor(overallLevel)}44 100%)`,
              border: `2px solid ${getOverallColor(overallLevel)}`,
              color: getOverallColor(overallLevel)
            }}
          >
            <span>{overallAcademicHealth}%</span>
            <small>Health</small>
          </div>
          <div className="risk-score-info">
            <h4>{overallLevel} RISK</h4>
            <span>Overall Academic Standing</span>
          </div>
        </div>
      </div>

      {/* SUBJECTS RISK GRID */}
      <div className="risk-grid">
        {subjects.length === 0 ? (
          <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center', gridColumn: '1 / -1' }}>
            No enrolled subjects available for risk analysis.
          </div>
        ) : (
          subjects.map(item => {
            const r = item.risk || {};
            const factors = r.factors || {};
            return (
              <div key={item.courseId} className="risk-card">
                <div>
                  <div className="risk-card-top">
                    <div className="risk-card-title">
                      <h3>{item.courseName}</h3>
                      <span>{item.courseCode} • {item.facultyName}</span>
                    </div>
                    <span
                      className="risk-badge"
                      style={{
                        background: `${r.badgeColor}22`,
                        color: r.badgeColor,
                        border: `1px solid ${r.badgeColor}55`
                      }}
                    >
                      {r.level} Risk
                    </span>
                  </div>

                  {/* 4 Factor metrics */}
                  <div className="factors-row" style={{ marginTop: '16px' }}>
                    <div className="factor-item">
                      <label>Attendance</label>
                      <strong style={{ color: factors.attendancePct < 75 ? '#ef4444' : '#10b981' }}>
                        {factors.attendancePct}%
                      </strong>
                    </div>
                    <div className="factor-item">
                      <label>Marks</label>
                      <strong style={{ color: factors.marksPct < 50 ? '#f59e0b' : '#38bdf8' }}>
                        {factors.marksPct > 0 ? `${factors.marksPct}%` : 'N/A'}
                      </strong>
                    </div>
                    <div className="factor-item">
                      <label>Coursework</label>
                      <strong style={{ color: factors.assignmentPct < 60 ? '#f97316' : '#a855f7' }}>
                        {factors.assignmentPct}%
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="risk-recommendations">
                  <h5><span>💡</span> Actionable Recommendations</h5>
                  <ul>
                    {(r.recommendations || []).map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

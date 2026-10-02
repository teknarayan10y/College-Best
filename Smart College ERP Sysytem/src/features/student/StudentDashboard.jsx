import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./StudentDashboard.css";
import { api } from "../../auth/api";
import WelcomePopup from "../../components/WelcomePopup";
import { FaGraduationCap, FaCheckCircle, FaTimesCircle, FaHourglassHalf, FaArrowRight } from "react-icons/fa";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [twin, setTwin] = useState(null);
  const [examData, setExamData] = useState(null);
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
        const [res, dt, examRes] = await Promise.all([
          api.studentData().catch(() => null),
          api.digitalTwin().catch(() => null),
          api.studentExamMarks().catch(() => null)
        ]);
        if (res) setData(res);
        if (dt) setTwin(dt);
        if (examRes) setExamData(examRes);
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

  const examMarks = (examData?.marks && examData.marks.length > 0) ? examData.marks : (data?.examMarks || []);
  const examSummary = examData?.summary || data?.examSummary || null;
  const displayCgpa = examSummary?.sgpa || data?.stats?.cgpa || stats.cgpa;

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
        <SummaryCard title="Total Subjects" value={examSummary?.totalSubjects || stats.totalSubjects} icon="📚" />
        <SummaryCard title="Attendance" value={`${stats.attendance}%`} icon="📊" />
        <SummaryCard title="Pending Assignments" value={stats.pendingAssignments} icon="📝" />
        <SummaryCard title="CGPA / SGPA" value={displayCgpa} icon="🎓" />
      </div>

      {/* ================= Exam Section: Subject-Wise Marks ================= */}
      <div className="card" style={{ marginTop: '28px', padding: '28px', borderRadius: '18px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', background: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FaGraduationCap style={{ color: '#2563eb' }} /> Examination Marks (Subject-Wise)
            </h2>
            <p style={{ margin: '6px 0 0 0', color: '#475569', fontSize: '0.94rem', fontWeight: 500 }}>
              Official continuous evaluation, practicals, semester exams, and grades.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {examSummary && (
              <span style={{
                background: '#eff6ff',
                color: '#1e40af',
                border: '1.5px solid #bfdbfe',
                padding: '7px 16px',
                borderRadius: '30px',
                fontSize: '0.88rem',
                fontWeight: 700
              }}>
                Average: {examSummary.averagePercentage}% • {examSummary.standing}
              </span>
            )}
            <Link
              to="/student/exams"
              className="btn small"
              style={{
                background: '#2563eb',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                padding: '9px 18px',
                borderRadius: '10px',
                boxShadow: '0 3px 10px rgba(37, 99, 235, 0.25)'
              }}
            >
              <span>View Full Exams Section</span>
              <FaArrowRight style={{ fontSize: '0.8rem' }} />
            </Link>
          </div>
        </div>

        {examMarks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#475569' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📝</div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>No examination marks recorded yet.</p>
            <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#64748b' }}>Once your instructors evaluate your marks, they will appear here automatically.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1.5px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.92rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#1e293b' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Subject & Code</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Instructor</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Semester Exam (60)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Assignment (20)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Practical (20)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Total (100)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Grade</th>
                  <th style={{ padding: '14px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.84rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {examMarks.map((m) => (
                  <tr key={m._id || m.courseId} style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.02rem' }}>{m.subjectName}</div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '3px', fontWeight: 600 }}>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 7px', borderRadius: '5px', fontWeight: 800, marginRight: '6px', border: '1px solid #c7d2fe' }}>
                          {m.subjectCode}
                        </span>
                        Sem {m.semester} • {m.credits} Credits
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 600 }}>
                      {m.facultyName || '-'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {m.isEvaluated ? (
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.08rem' }}>
                          {m.semesterExam} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>/ 60</span>
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {m.isEvaluated ? (
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.08rem' }}>
                          {m.assignment} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>/ 20</span>
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {m.isEvaluated ? (
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.08rem' }}>
                          {m.practical} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>/ 20</span>
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {m.isEvaluated ? (
                        <div style={{ minWidth: '110px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0f172a', marginBottom: '5px', fontSize: '1.15rem' }}>
                            <span>{m.totalMarks}</span>
                            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>/ 100</span>
                          </div>
                          <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, Math.max(0, m.totalMarks))}%`,
                              height: '100%',
                              borderRadius: '4px',
                              background: m.totalMarks >= 75 ? 'linear-gradient(90deg, #059669, #10b981)' : (m.totalMarks >= 40 ? 'linear-gradient(90deg, #2563eb, #38bdf8)' : 'linear-gradient(90deg, #dc2626, #f87171)')
                            }} />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 600, fontSize: '0.86rem' }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '0.98rem',
                        padding: '0 8px',
                        background: m.grade === 'O' ? '#f3e8ff' : (m.grade === 'A+' || m.grade === 'A' ? '#ecfdf5' : (m.grade === 'F' ? '#fef2f2' : '#eff6ff')),
                        color: m.grade === 'O' ? '#6b21a8' : (m.grade === 'A+' || m.grade === 'A' ? '#065f46' : (m.grade === 'F' ? '#991b1b' : '#1e40af')),
                        border: `1.5px solid ${m.grade === 'O' ? '#d8b4fe' : (m.grade === 'A+' || m.grade === 'A' ? '#6ee7b7' : (m.grade === 'F' ? '#fca5a5' : '#93c5fd'))}`
                      }}>
                        {m.grade || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {m.status === 'PASS' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#047857',
                          background: '#ecfdf5',
                          border: '1.5px solid #6ee7b7',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontWeight: 700,
                          fontSize: '0.84rem'
                        }}>
                          <FaCheckCircle /> PASS
                        </span>
                      ) : m.status === 'FAIL' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#b91c1c',
                          background: '#fef2f2',
                          border: '1.5px solid #fca5a5',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontWeight: 700,
                          fontSize: '0.84rem'
                        }}>
                          <FaTimesCircle /> FAIL
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#b45309',
                          background: '#fffbeb',
                          border: '1.5px solid #fde68a',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontWeight: 700,
                          fontSize: '0.84rem'
                        }}>
                          <FaHourglassHalf /> PENDING
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

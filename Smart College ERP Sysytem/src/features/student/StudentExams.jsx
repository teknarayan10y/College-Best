import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../auth/api';
import './StudentExams.css';

import {
  FaGraduationCap,
  FaAward,
  FaCheckCircle,
  FaTimesCircle,
  FaHourglassHalf,
  FaPrint,
  FaSearch,
  FaThLarge,
  FaList,
  FaBookOpen,
  FaUserTie,
  FaSync
} from 'react-icons/fa';

export default function StudentExams() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [selectedSem, setSelectedSem] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  const semesters = [1, 2, 3, 4, 5, 6, 7, 8];

  const fetchExamMarks = async (sem = selectedSem) => {
    try {
      setRefreshing(true);
      const params = sem !== 'all' ? { semester: sem } : {};
      const res = await api.studentExamMarks(params);
      setData(res);
      setErr('');
    } catch (e) {
      console.error('Error fetching exam marks:', e);
      setErr(e.message || 'Failed to load exam marks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExamMarks(selectedSem);
  }, [selectedSem]);

  // Filtered marks list
  const filteredMarks = useMemo(() => {
    const list = data?.marks || [];
    return list.filter((item) => {
      // Search filter
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (item.subjectName && item.subjectName.toLowerCase().includes(q)) ||
        (item.subjectCode && item.subjectCode.toLowerCase().includes(q)) ||
        (item.facultyName && item.facultyName.toLowerCase().includes(q));

      // Status filter
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PASS' && item.status === 'PASS') ||
        (statusFilter === 'FAIL' && item.status === 'FAIL') ||
        (statusFilter === 'PENDING' && item.status === 'PENDING');

      return matchesSearch && matchesStatus;
    });
  }, [data, searchQuery, statusFilter]);

  const summary = data?.summary || {
    totalSubjects: 0,
    evaluatedSubjects: 0,
    pendingSubjects: 0,
    totalMarksScored: 0,
    maxPossibleMarks: 0,
    averagePercentage: 0,
    sgpa: 0,
    passedSubjects: 0,
    failedSubjects: 0,
    standing: 'N/A'
  };

  const student = data?.student || {};

  const handlePrint = () => {
    window.print();
  };

  const getGradeClass = (grade) => {
    if (!grade || grade === '-') return 'grade-none';
    const clean = grade.toLowerCase().replace('+', 'plus');
    return `grade-${clean}`;
  };

  const getProgressGradClass = (total) => {
    if (total >= 90) return 'grad-o';
    if (total >= 70) return 'grad-a';
    if (total >= 50) return 'grad-b';
    if (total >= 40) return 'grad-c';
    return 'grad-f';
  };

  if (loading) {
    return (
      <div className="student-exams-root">
        <div className="exams-header-banner">
          <div className="exams-header-title">
            <h1><FaGraduationCap /> Examination Marks & Grade Card</h1>
            <p>Loading your subject-wise marks from institutional records...</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <FaSync className="fa-spin" style={{ fontSize: '2rem', marginBottom: '12px' }} />
          <div>Retrieving marks records...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-exams-root">
      {/* ================= Header Banner ================= */}
      <div className="exams-header-banner">
        <div className="exams-header-title">
          <h1>
            <FaGraduationCap /> Examination Marks & Academic Results
          </h1>
          <p>
            Official subject-wise breakdown: Semester Exam (/60), Assignment (/20), Practical (/20), Total Marks (/100), and Grade Points.
          </p>
        </div>

        <div className="exams-header-actions">
          <button
            type="button"
            className="btn-print-grades"
            onClick={handlePrint}
            title="Print or Save Grade Sheet as PDF"
          >
            <FaPrint /> Print Grade Card
          </button>
          <button
            type="button"
            className="btn-refresh-exams"
            onClick={() => fetchExamMarks(selectedSem)}
            disabled={refreshing}
            title="Refresh Marks"
          >
            <FaSync className={refreshing ? 'fa-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {err && (
        <div className="alert error" style={{ margin: 0 }}>
          {err}
        </div>
      )}

      {/* ================= Overall Summary Cards ================= */}
      <div className="exams-metrics-grid">
        <div className="exam-metric-card">
          <div className="metric-icon-wrap primary">
            <FaBookOpen />
          </div>
          <div className="metric-data">
            <span className="metric-lbl">Evaluated Subjects</span>
            <span className="metric-val">
              {summary.evaluatedSubjects} <span style={{ fontSize: '1rem', color: '#64748b' }}>/ {summary.totalSubjects}</span>
            </span>
            <span className="metric-sub">
              {summary.pendingSubjects > 0 ? `${summary.pendingSubjects} pending entry` : 'All marks entered'}
            </span>
          </div>
        </div>

        <div className="exam-metric-card">
          <div className="metric-icon-wrap success">
            <FaAward />
          </div>
          <div className="metric-data">
            <span className="metric-lbl">Cumulative SGPA</span>
            <span className="metric-val">{summary.sgpa || '8.50'}</span>
            <span className="metric-sub">Out of 10.0 scale</span>
          </div>
        </div>

        <div className="exam-metric-card">
          <div className="metric-icon-wrap info">
            <FaGraduationCap />
          </div>
          <div className="metric-data">
            <span className="metric-lbl">Average Score</span>
            <span className="metric-val">{summary.averagePercentage}%</span>
            <span className="metric-sub">
              {summary.totalMarksScored} / {summary.maxPossibleMarks || (summary.evaluatedSubjects * 100)} Marks
            </span>
          </div>
        </div>

        <div className="exam-metric-card">
          <div className="metric-icon-wrap warning">
            {summary.failedSubjects > 0 ? <FaTimesCircle style={{ color: '#ef4444' }} /> : <FaCheckCircle style={{ color: '#10b981' }} />}
          </div>
          <div className="metric-data">
            <span className="metric-lbl">Academic Standing</span>
            <span className="metric-val" style={{ fontSize: '1.15rem' }}>
              {summary.standing}
            </span>
            <span className="metric-sub">
              {summary.passedSubjects} Passed {summary.failedSubjects > 0 ? `• ${summary.failedSubjects} Arrears` : '• 0 Arrears'}
            </span>
          </div>
        </div>
      </div>

      {/* ================= Control Bar: Filters & View Modes ================= */}
      <div className="exams-controls-card">
        {/* Semester Filter Pills */}
        <div className="sem-filter-chips">
          <button
            type="button"
            className={`sem-chip ${selectedSem === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedSem('all')}
          >
            All Semesters
          </button>
          {semesters.map((s) => (
            <button
              key={s}
              type="button"
              className={`sem-chip ${selectedSem === String(s) ? 'active' : ''}`}
              onClick={() => setSelectedSem(String(s))}
            >
              Sem {s}
            </button>
          ))}
        </div>

        {/* Search, Status & View Toggle */}
        <div className="filter-search-wrap">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <FaSearch style={{ position: 'absolute', left: 10, color: '#64748b', fontSize: '0.8rem' }} />
            <input
              type="text"
              className="exam-search-box"
              style={{ paddingLeft: '28px' }}
              placeholder="Search subject or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="exam-select-dropdown"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Results</option>
            <option value="PASS">Passed Only</option>
            <option value="FAIL">Failed Only</option>
            <option value="PENDING">Pending Evaluation</option>
          </select>

          <div className="view-toggle-btns">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <FaList /> Table
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Cards Grid View"
            >
              <FaThLarge /> Cards
            </button>
          </div>
        </div>
      </div>

      {/* ================= Subject-Wise Marks Content ================= */}
      {filteredMarks.length === 0 ? (
        <div className="exams-empty-state">
          <div className="empty-icon">📝</div>
          <h3>No Examination Marks Found</h3>
          <p>
            {searchQuery || statusFilter !== 'ALL'
              ? 'No subjects match your active search or status filters. Try clearing filters.'
              : selectedSem !== 'all'
              ? `No evaluated marks recorded for Semester ${selectedSem}. Once course faculty submits your marks, they will appear here.`
              : 'No examination marks have been submitted yet for your courses. Check back after your faculty completes grade evaluations.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="exams-table-card">
          <div className="table-responsive">
            <table className="marks-table">
              <thead>
                <tr>
                  <th>Subject & Code</th>
                  <th>Faculty Instructor</th>
                  <th>Semester Exam (60)</th>
                  <th>Assignment (20)</th>
                  <th>Practical (20)</th>
                  <th>Total Marks (100)</th>
                  <th>Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMarks.map((item) => (
                  <tr key={item._id || item.courseId}>
                    {/* Subject info */}
                    <td>
                      <div className="subject-info-cell">
                        <span className="sub-title">{item.subjectName}</span>
                        <div className="sub-meta">
                          <span className="sub-code-tag">{item.subjectCode}</span>
                          <span>• Sem {item.semester}</span>
                          <span>• {item.credits} Credits</span>
                        </div>
                      </div>
                    </td>

                    {/* Instructor */}
                    <td>
                      <div className="instructor-cell">
                        <div className="instructor-avatar">
                          {(item.facultyName || 'F')[0].toUpperCase()}
                        </div>
                        <div>
                          <div>{item.facultyName}</div>
                          {item.facultyEmail && (
                            <small style={{ color: '#64748b', fontSize: '0.74rem' }}>{item.facultyEmail}</small>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Semester Exam */}
                    <td>
                      {item.isEvaluated ? (
                        <div className="score-pill">
                          <span className="score-num">{item.semesterExam}</span>
                          <span className="score-max">/ 60</span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>

                    {/* Assignment */}
                    <td>
                      {item.isEvaluated ? (
                        <div className="score-pill">
                          <span className="score-num">{item.assignment}</span>
                          <span className="score-max">/ 20</span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>

                    {/* Practical */}
                    <td>
                      {item.isEvaluated ? (
                        <div className="score-pill">
                          <span className="score-num">{item.practical}</span>
                          <span className="score-max">/ 20</span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>

                    {/* Total Score & Bar */}
                    <td>
                      {item.isEvaluated ? (
                        <div className="total-score-wrap">
                          <div className="total-score-header">
                            <span className="score-num-big">{item.totalMarks}</span>
                            <span className="score-max-sub">/ 100</span>
                          </div>
                          <div className="progress-track">
                            <div
                              className={`progress-fill ${getProgressGradClass(item.totalMarks)}`}
                              style={{ width: `${Math.min(100, Math.max(0, item.totalMarks))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 600, fontSize: '0.86rem' }}>Awaiting marks</span>
                      )}
                    </td>

                    {/* Grade */}
                    <td>
                      <span className={`grade-badge ${getGradeClass(item.grade)}`}>
                        {item.grade || '-'}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      {item.status === 'PASS' ? (
                        <span className="status-badge pass">
                          <FaCheckCircle /> PASS
                        </span>
                      ) : item.status === 'FAIL' ? (
                        <span className="status-badge fail">
                          <FaTimesCircle /> FAIL
                        </span>
                      ) : (
                        <span className="status-badge pending">
                          <FaHourglassHalf /> PENDING
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="exams-cards-grid">
          {filteredMarks.map((item) => (
            <div className="exam-subject-card" key={item._id || item.courseId}>
              <div className="card-top-row">
                <div className="card-subject-meta">
                  <h3 className="card-subject-name">{item.subjectName}</h3>
                  <div className="card-subject-sub">
                    <span className="sub-code-tag">{item.subjectCode}</span>
                    <span>• Sem {item.semester}</span>
                    <span>• {item.credits} Credits</span>
                  </div>
                </div>

                <span className={`grade-badge ${getGradeClass(item.grade)}`}>
                  {item.grade || '-'}
                </span>
              </div>

              {/* Breakdown Grid */}
              <div className="card-marks-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">Semester Exam</span>
                  <span className="breakdown-val">{item.isEvaluated ? item.semesterExam : '-'}</span>
                  <span className="breakdown-max">Max: 60</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Assignment</span>
                  <span className="breakdown-val">{item.isEvaluated ? item.assignment : '-'}</span>
                  <span className="breakdown-max">Max: 20</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Practical</span>
                  <span className="breakdown-val">{item.isEvaluated ? item.practical : '-'}</span>
                  <span className="breakdown-max">Max: 20</span>
                </div>
              </div>

              {/* Progress bar */}
              {item.isEvaluated && (
                <div className="total-score-wrap" style={{ width: '100%' }}>
                  <div className="total-score-header">
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Total Aggregate</span>
                    <span>
                      {item.totalMarks} <small style={{ fontSize: '0.75rem', color: '#64748b' }}>/ 100</small>
                    </span>
                  </div>
                  <div className="progress-track" style={{ height: '7px' }}>
                    <div
                      className={`progress-fill ${getProgressGradClass(item.totalMarks)}`}
                      style={{ width: `${Math.min(100, Math.max(0, item.totalMarks))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Card Bottom Row */}
              <div className="card-total-row">
                <div className="card-faculty-info">
                  <FaUserTie />
                  <span>{item.facultyName}</span>
                </div>

                {item.status === 'PASS' ? (
                  <span className="status-badge pass">
                    <FaCheckCircle /> PASS
                  </span>
                ) : item.status === 'FAIL' ? (
                  <span className="status-badge fail">
                    <FaTimesCircle /> FAIL
                  </span>
                ) : (
                  <span className="status-badge pending">
                    <FaHourglassHalf /> PENDING
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= Grading Scale Reference Legend ================= */}
      <div className="grading-legend-card">
        <div className="legend-header">
          <FaAward /> Institutional Grading System Reference
        </div>
        <div className="legend-grid">
          <div className="legend-item">
            <span className="grade-badge grade-o" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>O</span>
            <span>90–100% (Outstanding)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-aplus" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>A+</span>
            <span>80–89% (Excellent)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-a" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>A</span>
            <span>70–79% (Very Good)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-bplus" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>B+</span>
            <span>60–69% (Good)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-b" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>B</span>
            <span>50–59% (Above Avg)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-c" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>C</span>
            <span>40–49% (Pass)</span>
          </div>
          <div className="legend-item">
            <span className="grade-badge grade-f" style={{ minWidth: 24, height: 24, fontSize: '0.75rem' }}>F</span>
            <span>&lt;40% (Fail / Arrear)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

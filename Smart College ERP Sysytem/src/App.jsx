import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

/* -------- STUDENT -------- */
import StudentLayout from "./features/student/StudentLayout";
import StudentDashboard from "./features/student/StudentDashboard";
import StudentProfile from "./features/student/StudentProfile";
import StudentCourses from "./features/student/StudentCourses";
import StudentAttendance from "./features/student/StudentAttendance";
import StudentAssignments from "./features/student/StudentAssignments";
import StudentAcademicRisk from "./features/student/StudentAcademicRisk";
import StudentNotifications from "./features/student/StudentNotifications";
import StudentExams from "./features/student/StudentExams";

/* -------- FACULTY -------- */
import FacultyLayout from "./features/faculty/FacultyLayout";
import FacultyDashboard from "./features/faculty/FacultyDashboard";
import FacultyProfile from "./features/faculty/FacultyProfile";
import FacultyMyStudents from "./features/faculty/FacultyMyStudents";
import FacultyMySubjects from "./features/faculty/FacultyMySubjects";
import FacultyAttendance from './features/faculty/FacultyAttendance';
import AssignmentUpload from "./features/faculty/AssignmentUpload";
import FacultyMarksEntry from "./features/faculty/FacultyMarksEntry";
import FacultyMarksSummary from './features/faculty/FacultyMarksSummary';

/* -------- ADMIN -------- */
import AdminLayout from "./features/admin/AdminLayout";
import AdminProfile from "./features/admin/AdminProfile";
import AdminDashboard from "./features/admin/AdminDashboard";
import CreateFaculty from "./features/admin/CreateFaculty";
import AdminFaculty from "./features/admin/AdminFaculty";
import AdminFacultyProfile from "./features/admin/AdminFacultyProfile";
import AdminStudents from "./features/admin/AdminStudents";
import AdminStudentProfile from "./features/admin/AdminStudentProfile";
import AdminCourses from "./features/admin/AdminCourses";
import CreateCourse from "./features/admin/CreateCourse";
import EditCourse from "./features/admin/EditCourse";
import AdminDepartments from "./features/admin/AdminDepartments";
import CreateDepartment from "./features/admin/CreateDepartment";
import EditDepartment from "./features/admin/EditDepartment";
import AdminAttendance from "./features/admin/AdminAttendance";
import AdminSettings from "./features/admin/AdminSettings";



/* -------- AUTH -------- */
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import "./App.css";

/* ---------------- HOME ---------------- */
function Home() {
  return (
    <div className="container">
      <header className="page-header">
        <h1>Smart College ERP</h1>
        <p>Select a dashboard to continue, or explore our new AI Biometric Attendance suite.</p>
      </header>

      {/* SnapClass AI Biometric Showcase */}
      <div style={{
        margin: '20px 0',
        padding: '16px 24px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(6, 182, 212, 0.15))',
        borderRadius: '14px',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        textAlign: 'left'
      }}>
        <div>
          <span style={{ fontSize: '0.75rem', background: '#4f46e5', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>NEW FEATURE</span>
          <h3 style={{ margin: '6px 0 2px 0', color: '#fff' }}>⚡ SnapClass AI Attendance</h3>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
            Instant classroom attendance via Face Recognition & Voice Biometrics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="http://localhost:5002"
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}
          >
            Explore Showcase ↗
          </a>
          <Link to="/login" className="btn" style={{ background: 'linear-gradient(135deg, #4f46e5, #06b6d4)' }}>
            FaceID Sign In 🚀
          </Link>
        </div>
      </div>

      <nav className="nav">
        <Link to="/student" className="btn">Student Dashboard</Link>
        <Link to="/faculty" className="btn">Faculty Dashboard</Link>
        <Link to="/admin" className="btn">Admin Dashboard</Link>
        <Link to="/login" className="btn secondary">Login</Link>
        <Link to="/signup" className="btn ghost">Signup</Link>
      </nav>
    </div>
  );
}

/* ---------------- APP ---------------- */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* ================= STUDENT ================= */}
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="profile" element={<StudentProfile />} />
          <Route path="courses" element={<StudentCourses />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="exams" element={<StudentExams />} />
          <Route path="academic-risk" element={<StudentAcademicRisk />} />
          <Route path="results" element={<StudentAcademicRisk />} />
          <Route path="notifications" element={<StudentNotifications />} />
        </Route>

        {/* ================= FACULTY ================= */}
        <Route path="/faculty" element={<FacultyLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FacultyDashboard />} />
          <Route path="profile" element={<FacultyProfile />} /> {/* NEW */}
          <Route path="students" element={<FacultyMyStudents />} />
          <Route path="my-subjects" element={<FacultyMySubjects />} />
          <Route path="attendance" element={<FacultyAttendance />} />
          <Route path="assignments" element={<AssignmentUpload />} />
          <Route path="marks" element={<FacultyMarksEntry />} />
          <Route path="/faculty/marks-summary" element={<FacultyMarksSummary />} />


          {/* add more faculty pages later */}
        </Route>

        {/* ================= ADMIN ================= */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="profile" element={<AdminProfile />} />
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="create-faculty" element={<CreateFaculty />} />
          <Route path="faculty" element={<AdminFaculty />} />
          <Route path="faculty/:facultyId" element={<AdminFacultyProfile />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="students/:studentId" element={<AdminStudentProfile />} />
          <Route path="courses" element={<AdminCourses />} />
          <Route path="courses/create" element={<CreateCourse />} />

          <Route path="courses/:courseId/edit" element={<EditCourse />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="departments/create" element={<CreateDepartment />} />
          <Route path="departments/:departmentId/edit" element={<EditDepartment />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="settings" element={<AdminSettings />} />



          {/* add admin pages later */}
        </Route>

        {/* ================= AUTH ================= */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

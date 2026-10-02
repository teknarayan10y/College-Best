// src/features/faculty/FacultyLayout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../../auth/storage";
import {
  FaHome,
  FaUser,
  FaBook,
  FaCalendarCheck,
  FaChartBar,
  FaTasks,
  FaCog,
  FaBell,
  FaUsers,
  FaSignOutAlt,
} from "react-icons/fa";
import { api } from "../../auth/api";
import FacultyAiChat from "./FacultyAiChat";
import "../student/StudentDashboard.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function FacultyLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [photoUrl, setPhotoUrl] = useState(localStorage.getItem("faculty_photo_url") || "");
  const [user, setUserState] = useState(null);
  const navigate = useNavigate();

  const demo = useMemo(
    () => ({
      profile: { name: "Faculty", department: "", designation: "", facultyId: "" },
      notices: [],
    }),
    []
  );
  const { profile, notices } = demo;

  // Fetch auth user for name/email
  useEffect(() => {
    const refreshUser = async () => {
      try {
        const me = await api.me();
        if (me?.user) setUserState(me.user);
      } catch { }
    };
    refreshUser();
    window.addEventListener("profile-info-updated", refreshUser);
    return () => {
      window.removeEventListener("profile-info-updated", refreshUser);
    };
  }, []);

  // Load avatar and cache-bust
  useEffect(() => {
    (async () => {
      try {
        const res = await api.facultyProfileGet();
        if (res?.profile?.profileImage) {
          const abs = toAbsoluteUploadUrl(res.profile.profileImage);
          const bust = abs ? `${abs}?t=${Date.now()}` : "";
          setPhotoUrl(bust);
          localStorage.setItem("faculty_photo_url", bust);
        }
      } catch { }
    })();
  }, []);

  // React to photo changes from profile page
  useEffect(() => {
    const onChange = () => setPhotoUrl(localStorage.getItem("faculty_photo_url") || "");
    window.addEventListener("storage", onChange);
    window.addEventListener("faculty-photo-updated", onChange);
    window.addEventListener("profile-photo-updated", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("faculty-photo-updated", onChange);
      window.removeEventListener("profile-photo-updated", onChange);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`student-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Smart ERP</h2>
          <span>Faculty Panel</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/faculty/dashboard" className="nav-item">
            <FaHome className="nav-icon" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/faculty/profile" className="nav-item">
            <FaUser className="nav-icon" />
            <span>My Profile</span>
          </NavLink>

          <NavLink to="/faculty/my-subjects" className="nav-item">
            <FaBook className="nav-icon" />
            <span>My Subjects</span>
          </NavLink>

          <NavLink to="/faculty/students" className="nav-item">
            <FaUsers className="nav-icon" />
            <span>My Students</span>
          </NavLink>

          <NavLink to="/faculty/attendance" className="nav-item">
            <FaCalendarCheck className="nav-icon" />
            <span>Attendance</span>
          </NavLink>

          <NavLink to="/faculty/marks" className="nav-item">
            <FaChartBar className="nav-icon" />
            <span>Marks</span>
          </NavLink>
          <NavLink to="/faculty/marks-summary" className="nav-item">
            <FaChartBar className="nav-icon" /> <span> Marks Summary </span>
          </NavLink>

          <NavLink to="/faculty/assignments" className="nav-item">
            <FaTasks className="nav-icon" />
            <span>Assignments</span>
          </NavLink>

          <NavLink to="/faculty/settings" className="nav-item">
            <FaCog className="nav-icon" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <button className="btn logout full" onClick={handleLogout}>
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </aside>

      <main className="main">
        <header className="page-header">
          <div className="header-left">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <div>
              <h1>Faculty Portal</h1>
              {/* <p>{user?.email || ""}</p> */}
            </div>
          </div>

          <div className="header-right">
            <NavLink to="/faculty/notifications" className="notification" title="Notifications">
              <FaBell className="nav-icon" />
              {notices.length > 0 && <span className="badge">{notices.length}</span>}
            </NavLink>

            <div
              className="header-profile clickable"
              onClick={() => navigate("/faculty/profile")}
              title="Open profile"
            >
              <div className="avatar small">
                {photoUrl ? <img src={photoUrl} alt="avatar" /> : (user?.name?.charAt(0).toUpperCase() || "F")}
              </div>
              <div className="header-profile-info">
                <strong>{user?.name || "Faculty"}</strong>
                <span>{user?.email || ""}</span>
              </div>
            </div>

            <button className="btn logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="container">
          <Outlet />
        </div>
      </main>

      {/* Modern Faculty AI Co-Pilot Floating Assistant */}
      <FacultyAiChat />
    </div>
  );
}
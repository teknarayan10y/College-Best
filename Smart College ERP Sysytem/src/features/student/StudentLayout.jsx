// src/features/student/StudentLayout.jsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken, clearUser, getUser, setUser } from "../../auth/storage";
import { api } from "../../auth/api";
import StudentAiChat from "./StudentAiChat";
import "./StudentDashboard.css";

/* ICONS */
import {
  FaHome,
  FaUser,
  FaBook,
  FaCalendarCheck,
  FaTasks,
  FaPen,
  FaChartBar,
  FaMoneyBill,
  FaQuestionCircle,
  FaCog,
  FaBell,
  FaSignOutAlt,
} from "react-icons/fa";

// Helper: absolute URL for /uploads/...
// replace existing toAbsoluteUploadUrl in both files
function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  // Drop trailing /api if present to point to the server origin for static files
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUserState] = useState(null);        // { name, email, role }
  const [photoUrl, setPhotoUrl] = useState(localStorage.getItem("profile_photo_url") || "");
  const [notices] = useState([]);
  const navigate = useNavigate();

  // Load cached user immediately, then refresh + fetch profile image
  useEffect(() => {
    const cached = getUser();
    if (cached) setUserState(cached);

    (async () => {
      try {
        // Refresh user from server
        const me = await api.me();
        if (me?.user) {
          setUserState(me.user);
          setUser(me.user); // keep storage in sync
        }
      } catch {
        // ignore missing/expired token
      }

      // Fetch profile to get saved avatar
      try {
        const res = await api.profileGet(); // { profile }
        if (res?.profile?.profileImage) {
          const abs = toAbsoluteUploadUrl(res.profile.profileImage);
          const bust = abs ? `${abs}?t=${Date.now()}` : "";
          setPhotoUrl(bust);
          localStorage.setItem("profile_photo_url", bust);
        }
      } catch {
        // profile may not exist yet
      }
    })();
  }, []);

  // React to photo changes saved from the profile page
  useEffect(() => {
    const onChange = () => {
      const v = localStorage.getItem("profile_photo_url") || "";
      setPhotoUrl(v);
    };
    window.addEventListener("storage", onChange);
    window.addEventListener("profile-photo-updated", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("profile-photo-updated", onChange);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  };

  const displayName = user?.name || "Student";
  const initial = displayName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div className={`student-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      {/* ========== SIDEBAR ========== */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Smart ERP</h2>
          <span>Student Panel</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/student/dashboard"
            className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
          >
            <FaHome className="nav-icon" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/student/profile"
            className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
          >
            <FaUser className="nav-icon" />
            <span>Complete Profile</span>
          </NavLink>

          <NavLink to="/student/courses" className="nav-item">
            <FaBook className="nav-icon" />
            <span>My Courses</span>
          </NavLink>

          <NavLink to="/student/attendance" className="nav-item">
            <FaCalendarCheck className="nav-icon" />
            <span>Attendance</span>
          </NavLink>

          <NavLink to="/student/assignments" className="nav-item">
            <FaTasks className="nav-icon" />
            <span>Assignments</span>
          </NavLink>

          <NavLink to="/student/exams" className="nav-item">
            <FaPen className="nav-icon" />
            <span>Exams</span>
          </NavLink>

          <NavLink to="/student/results" className="nav-item">
            <FaChartBar className="nav-icon" />
            <span>Results</span>
          </NavLink>

          <NavLink to="/student/fees" className="nav-item">
            <FaMoneyBill className="nav-icon" />
            <span>Fees</span>
          </NavLink>

          <NavLink to="/student/support" className="nav-item">
            <FaQuestionCircle className="nav-icon" />
            <span>Support / Help</span>
          </NavLink>

          <NavLink to="/student/settings" className="nav-item">
            <FaCog className="nav-icon" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <button className="btn logout full" onClick={handleLogout}>
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </aside>

      {/* ========== MAIN ========== */}
      <main className="main">
        {/* HEADER */}
        <header className="page-header">
          <div className="header-left">
            <button
              className="menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <div>
              <h1>Student Portal</h1>
              <p>{user?.email || ""}</p>
            </div>
          </div>

          <div className="header-right">
            <NavLink to="/student/notifications" className="notification" title="Notifications">
              <FaBell className="nav-icon" />
              {notices.length > 0 && <span className="badge">{notices.length}</span>}
            </NavLink>

            <div
              className="header-profile clickable"
              onClick={() => navigate("/student/profile")}
            >
              <div className="avatar small">
                {photoUrl ? <img src={photoUrl} alt="avatar" /> : initial}
              </div>
              <div className="header-profile-info">
                <strong>{displayName}</strong>
                <span>{user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : "Student"}</span>
              </div>
            </div>

            <button className="btn logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="container">
          <Outlet />
        </div>

        {/* STUDENT AI ASSISTANT WIDGET */}
        <StudentAiChat />
      </main>
    </div>
  );
}
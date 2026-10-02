import React from "react";
import { Link } from "react-router-dom";
import {
  FaUniversity,
  FaGraduationCap,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaUserShield,
  FaArrowRight,
  FaCheckCircle,
  FaChartLine,
  FaClock,
  FaBell,
  FaRobot,
  FaLock,
  FaExternalLinkAlt
} from "react-icons/fa";
import "./landing.css";

export default function LandingPage() {
  return (
    <div className="landing-wrapper">
      {/* 1. HEADER NAVBAR */}
      <header className="landing-navbar">
        <div className="landing-nav-container">
          <Link to="/" className="landing-brand">
            <div className="landing-brand-logo">
              <FaUniversity />
            </div>
            <div className="landing-brand-text">
              <span className="landing-brand-title">University X</span>
              <span className="landing-brand-subtitle">Smart Campus ERP Platform</span>
            </div>
          </Link>

          <nav className="landing-nav-links">
            <a href="#portals" className="landing-nav-item">Portals</a>
            <a href="#features" className="landing-nav-item">Capabilities</a>
            <a href="#ai-showcase" className="landing-nav-item">AI Biometrics</a>
          </nav>

          <div className="landing-nav-actions">
            <Link to="/login" className="landing-btn-auth landing-btn-login">
              <FaLock style={{ marginRight: '6px', fontSize: '12px' }} /> Login
            </Link>
            <Link to="/signup" className="landing-btn-auth landing-btn-signup">
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN BODY CONTENT */}
      <main className="landing-content">

        {/* 2. HERO SECTION */}
        <section className="landing-hero">
          <div className="landing-hero-badge">
            <FaGraduationCap /> Intelligent Student Academic Monitoring System
          </div>

          <h1 className="landing-hero-title">
            Intelligent Academic Monitoring,<br />
            <span>Built for Smarter Student Success</span>
          </h1>

          <p className="landing-hero-sub">
            Empowering students, faculty, and university administrators with real-time academic insights, automated attendance tracking, grade analytics, and proactive performance monitoring.
          </p>

          <div className="landing-hero-ctas">
            <a href="#portals" className="landing-hero-primary">
              Access Campus Portals <FaArrowRight />
            </a>
            <a href="http://localhost:5002" target="_blank" rel="noreferrer" className="landing-hero-secondary">
              AI Biometric Showcase <FaExternalLinkAlt style={{ fontSize: '12px' }} />
            </a>
          </div>
        </section>

        {/* 3. PORTAL ACCESS CARDS */}
        <section id="portals" className="landing-portals-section">
          <div className="landing-section-header">
            <h2 className="landing-section-title">University Portal Access</h2>
            <p className="landing-section-subtitle">
              Select your role to access your dedicated dashboard and academic tools
            </p>
          </div>

          <div className="landing-portal-grid">

            {/* STUDENT PORTAL CARD */}
            <div className="landing-portal-card portal-student">
              <div className="landing-portal-icon-wrap">
                <FaUserGraduate />
              </div>
              <h3 className="landing-portal-title">Student Portal</h3>
              <p className="landing-portal-subtitle">
                Academic Progress & Attendance Tracking
              </p>

              <ul className="landing-portal-features">
                <li><FaCheckCircle /> View real-time attendance percentage</li>
                <li><FaCheckCircle /> Monitor subject-wise marks & grades</li>
                <li><FaCheckCircle /> Access course schedules & assignments</li>
                <li><FaCheckCircle /> Track academic risk telemetry</li>
              </ul>

              <Link to="/student" className="landing-portal-btn">
                Access Student Portal <FaArrowRight />
              </Link>
            </div>

            {/* FACULTY PORTAL CARD */}
            <div className="landing-portal-card portal-faculty">
              <div className="landing-portal-icon-wrap">
                <FaChalkboardTeacher />
              </div>
              <h3 className="landing-portal-title">Faculty Portal</h3>
              <p className="landing-portal-subtitle">
                Classroom Management & Mark Entry
              </p>

              <ul className="landing-portal-features">
                <li><FaCheckCircle /> AI-assisted & manual attendance entry</li>
                <li><FaCheckCircle /> Student performance & risk monitoring</li>
                <li><FaCheckCircle /> Easy marks entry & grade summaries</li>
                <li><FaCheckCircle /> Course syllabus & assignment manager</li>
              </ul>

              <Link to="/faculty" className="landing-portal-btn">
                Access Faculty Portal <FaArrowRight />
              </Link>
            </div>

            {/* ADMINISTRATOR CONSOLE CARD */}
            <div className="landing-portal-card portal-admin">
              <div className="landing-portal-icon-wrap">
                <FaUserShield />
              </div>
              <h3 className="landing-portal-title">Admin Console</h3>
              <p className="landing-portal-subtitle">
                Campus Management & Analytics
              </p>

              <ul className="landing-portal-features">
                <li><FaCheckCircle /> Comprehensive student & faculty management</li>
                <li><FaCheckCircle /> Course & department configuration</li>
                <li><FaCheckCircle /> System-wide attendance analytics</li>
                <li><FaCheckCircle /> Role-based security & settings</li>
              </ul>

              <Link to="/admin" className="landing-portal-btn">
                Access Admin Console <FaArrowRight />
              </Link>
            </div>

          </div>
        </section>

        {/* 4. COMPACT FEATURE HIGHLIGHTS */}
        <section id="features" className="landing-highlights-section">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Core System Capabilities</h2>
            <p className="landing-section-subtitle">
              Engineered to streamline academic operations and enhance student outcomes
            </p>
          </div>

          <div className="landing-features-grid">
            <div className="landing-feature-item">
              <div className="landing-feature-icon">
                <FaClock />
              </div>
              <div className="landing-feature-title">Attendance Intelligence</div>
              <p className="landing-feature-desc">
                Automated facial recognition & voice biometrics integrated with standard roster logging.
              </p>
            </div>

            <div className="landing-feature-item">
              <div className="landing-feature-icon">
                <FaChartLine />
              </div>
              <div className="landing-feature-title">Academic Risk Analysis</div>
              <p className="landing-feature-desc">
                Early warning telemetry detecting students needing academic support before examinations.
              </p>
            </div>

            <div className="landing-feature-item">
              <div className="landing-feature-icon">
                <FaBell />
              </div>
              <div className="landing-feature-title">Automated Notifications</div>
              <p className="landing-feature-desc">
                Instant alerts for low attendance thresholds, assignment deadlines, and marks publishing.
              </p>
            </div>

            <div className="landing-feature-item">
              <div className="landing-feature-icon">
                <FaRobot />
              </div>
              <div className="landing-feature-title">AI-Assisted Mark Entry</div>
              <p className="landing-feature-desc">
                Streamlined gradebooks, automated GPA calculation, and instant summary reporting.
              </p>
            </div>
          </div>
        </section>

        {/* 5. AI BIOMETRIC SHOWCASE WIDGET */}
        <section id="ai-showcase" className="landing-ai-banner">
          <div className="landing-ai-content">
            <span className="landing-ai-badge">SNAPCLASS AI</span>
            <div>
              <h4 className="landing-ai-title">⚡ SnapClass AI Attendance Integration</h4>
              <p className="landing-ai-desc">
                Experience instant classroom attendance via Deep Learning Face Recognition and Voice Biometrics.
              </p>
            </div>
          </div>

          <div className="landing-ai-actions">
            <a
              href="http://localhost:5002"
              target="_blank"
              rel="noreferrer"
              className="landing-ai-btn landing-ai-btn-secondary"
            >
              Explore Showcase <FaExternalLinkAlt style={{ fontSize: '11px' }} />
            </a>
            <Link to="/login" className="landing-ai-btn landing-ai-btn-primary">
              FaceID Sign In <FaArrowRight />
            </Link>
          </div>
        </section>

      </main>

      {/* 6. SUBTLE FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-container">
          <div className="landing-footer-brand">
            University X • Intelligent Student Academic Monitoring System
          </div>

          <div>
            &copy; {new Date().getFullYear()} University X. All rights reserved.
          </div>

          <div className="landing-footer-links">
            <Link to="/student">Student</Link>
            <Link to="/faculty">Faculty</Link>
            <Link to="/admin">Admin</Link>
            <Link to="/login">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

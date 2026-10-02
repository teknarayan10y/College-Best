// src/features/admin/AdminStudentProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../auth/api";
import "./AdminStudentProfile.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function AdminStudentProfile() {
  const { studentId } = useParams(); // userId
  const [data, setData] = useState({ user: null, profile: null });
  const [form, setForm] = useState({});
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  // Image preview state
  const [showPreview, setShowPreview] = useState(false);

  async function load() {
    setErr(""); setOk("");
    const res = await api.adminStudentProfile(studentId);
    setData({ user: res.user, profile: res.profile });
    setForm({ ...(res.profile || {}) });
  }

  useEffect(() => {
    load().catch(e => setErr(e.message || "Failed to load"));
  }, [studentId]);

  const u = data.user || {};
  const p = data.profile || {};
  const photoUrl = toAbsoluteUploadUrl(p.profileImage) || "";

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const onSave = async () => {
    try {
      setSaving(true); setErr(""); setOk("");

      const payload = {
        // Personal
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        dob: form.dob,
        // Contact
        email: form.email,
        phone: form.phone,
        altPhone: form.altPhone,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        // Academic
        studentId: form.studentId,
        branch: form.branch,
        semester: form.semester,
        section: form.section,
        year: form.year,
        cgpa: form.cgpa,
        projects: form.projects,
        // Links/Other
        github: form.github,
        linkedin: form.linkedin,
        portfolio: form.portfolio,
        resumeLink: form.resumeLink,
        remarks: form.remarks,
      };

      if (Array.isArray(form.skills)) {
        payload.skills = form.skills;
      } else if (typeof form.skillsText === "string") {
        payload.skills = form.skillsText.split(",").map(s => s.trim()).filter(Boolean);
      }

      await api.adminUpdateStudentProfile(studentId, payload);
      setOk("Profile updated");
      setEdit(false);
      await load();
    } catch (e) {
      setErr(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    try {
      setSaving(true); setErr(""); setOk("");
      const next = !u.isActive;
      await api.adminUpdateStudentStatus(studentId, next);
      setOk(next ? "User activated" : "User deactivated");
      await load();
    } catch (e) {
      setErr(e.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const hasPersonal = p.firstName || p.lastName || p.gender || p.dob;
  const hasContact = p.phone || p.altPhone || p.address || p.city || p.state || p.pincode;
  const hasAcademic =
    p.studentId || p.branch || p.semester || p.section || p.year || p.cgpa ||
    (Array.isArray(p.skills) && p.skills.length) || p.projects;
  const hasLinks = p.github || p.linkedin || p.portfolio || p.resumeLink || p.remarks;

  return (
    <div className="admin-student-profile">
      <h1>Student Profile</h1>
      {err && <div className="form-error">{err}</div>}
      {ok && <div className="form-ok">{ok}</div>}

      <div className="student-profile-card profile-card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <img
            src={photoUrl || "/avatar-placeholder.png"}
            alt="Profile"
            className="profile-photo"
            onError={(e) => { e.currentTarget.src = "/avatar-placeholder.png"; }}
            onClick={() => { if (photoUrl) setShowPreview(true); }}
            style={{ cursor: photoUrl ? "zoom-in" : "default" }}
          />
          <div>
            <div className="name-line">
              <strong>{u.firstName || p.firstName || "-"}</strong>{" "}
              <strong>{u.lastName || p.lastName || ""}</strong>
            </div>
            <div className="email-line">{u.email || p.email || "-"}</div>
            <div className={`status-badge ${u.isActive ? "active" : "inactive"}`}>
              {u.isActive ? "Active" : "Inactive"}
            </div>
          </div>
        </div>

        {!edit ? (
          <>
            {hasPersonal && (
              <>
                
                <div className="grid-2">
                  <div><strong>First Name:</strong> {p.firstName || "-"}</div>
                  <div><strong>Last Name:</strong> {p.lastName || "-"}</div>
                  <div><strong>Gender:</strong> {p.gender || "-"}</div>
                  <div><strong>Date of Birth:</strong> {p.dob || "-"}</div>
                </div>
              </>
            )}

            {hasContact && (
              <>
               
                <div className="grid-2">
                  <div><strong>Phone:</strong> {p.phone || "-"}</div>
                  <div><strong>Alt Phone:</strong> {p.altPhone || "-"}</div>
                  <div className="col-span-2"><strong>Address:</strong> {p.address || "-"}</div>
                  <div><strong>City:</strong> {p.city || "-"}</div>
                  <div><strong>State:</strong> {p.state || "-"}</div>
                  <div><strong>Pincode:</strong> {p.pincode || "-"}</div>
                </div>
              </>
            )}

            {hasAcademic && (
              <>
                
                <div className="grid-2">
                  <div><strong>Student ID:</strong> {p.studentId || "-"}</div>
                  <div><strong>Branch:</strong> {p.branch || "-"}</div>
                  <div><strong>Semester:</strong> {p.semester || "-"}</div>
                  <div><strong>Section:</strong> {p.section || "-"}</div>
                  <div><strong>Year:</strong> {p.year || "-"}</div>
                  <div><strong>CGPA:</strong> {p.cgpa ?? "-"}</div>
                  {(Array.isArray(p.skills) && p.skills.length > 0) && (
                    <div className="col-span-2"><strong>Skills:</strong> {p.skills.join(", ")}</div>
                  )}
                  {p.projects && (
                    <div className="col-span-2"><strong>Projects:</strong> {p.projects}</div>
                  )}
                </div>
              </>
            )}

            {hasLinks && (
              <>
                <h3 className="section-title">Links</h3>
                <div className="grid-2">
                  {p.github && <div><strong>GitHub:</strong> {p.github}</div>}
                  {p.linkedin && <div><strong>LinkedIn:</strong> {p.linkedin}</div>}
                  {p.portfolio && <div className="col-span-2"><strong>Portfolio:</strong> {p.portfolio}</div>}
                  {p.resumeLink && (
                    <div className="col-span-2">
                      <strong>Resume:</strong>{" "}
                      <a href={p.resumeLink} target="_blank" rel="noreferrer">{p.resumeLink}</a>
                    </div>
                  )}
                  {p.remarks && <div className="col-span-2"><strong>Remarks:</strong> {p.remarks}</div>}
                </div>
              </>
            )}

            {(!hasPersonal && !hasContact && !hasAcademic && !hasLinks) && (
              <div style={{ color: "#6b7280" }}>No profile details available.</div>
            )}
          </>
        ) : (
          <div className="grid-2">
            {/* Personal */}
            <label className="field"><span>First Name</span>
              <input name="firstName" value={form.firstName || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Last Name</span>
              <input name="lastName" value={form.lastName || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Gender</span>
              <select className="input" name="gender" value={form.gender || ""} onChange={onChange}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="field"><span>Date of Birth</span>
              <input type="date" name="dob" value={form.dob || ""} onChange={onChange} />
            </label>

            {/* Contact */}
            <label className="field"><span>Email</span>
              <input name="email" value={form.email || u.email || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Phone</span>
              <input name="phone" value={form.phone || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Alt Phone</span>
              <input name="altPhone" value={form.altPhone || ""} onChange={onChange} />
            </label>
            <label className="field col-span-2"><span>Address</span>
              <input name="address" value={form.address || ""} onChange={onChange} />
            </label>
            <label className="field"><span>City</span>
              <input name="city" value={form.city || ""} onChange={onChange} />
            </label>
            <label className="field"><span>State</span>
              <input name="state" value={form.state || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Pincode</span>
              <input name="pincode" value={form.pincode || ""} onChange={onChange} />
            </label>

            {/* Academic */}
            <label className="field"><span>Student ID</span>
              <input name="studentId" value={form.studentId || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Branch</span>
              <input name="branch" value={form.branch || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Semester</span>
              <input name="semester" value={form.semester || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Section</span>
              <input name="section" value={form.section || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Year</span>
              <input name="year" value={form.year || ""} onChange={onChange} />
            </label>
            <label className="field"><span>CGPA</span>
              <input name="cgpa" value={form.cgpa ?? ""} onChange={onChange} />
            </label>

            <label className="field col-span-2"><span>Skills (comma-separated)</span>
              <input
                name="skills"
                value={
                  Array.isArray(form.skills) ? form.skills.join(", ")
                  : (form.skillsText ?? (form.skills || ""))
                }
                onChange={(e) => {
                  const txt = e.target.value;
                  setForm(f => ({
                    ...f,
                    skillsText: txt,
                    skills: txt.split(",").map(s => s.trim()).filter(Boolean),
                  }));
                }}
              />
            </label>

            <label className="field col-span-2"><span>Projects</span>
              <input name="projects" value={form.projects || ""} onChange={onChange} />
            </label>

            {/* Links */}
            <label className="field"><span>GitHub</span>
              <input name="github" value={form.github || ""} onChange={onChange} />
            </label>
            <label className="field"><span>LinkedIn</span>
              <input name="linkedin" value={form.linkedin || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Portfolio</span>
              <input name="portfolio" value={form.portfolio || ""} onChange={onChange} />
            </label>
            <label className="field col-span-2"><span>Resume Link</span>
              <input name="resumeLink" value={form.resumeLink || ""} onChange={onChange} />
            </label>

            <label className="field col-span-2"><span>Remarks</span>
              <input name="remarks" value={form.remarks || ""} onChange={onChange} />
            </label>
          </div>
        )}
      </div>

      <div className="admin-actions">
        {!edit ? (
          <button className="btn primary" onClick={() => setEdit(true)}>Edit Profile</button>
        ) : (
          <button className="btn primary" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</button>
        )}
        <button className="btn secondary" disabled={saving} onClick={toggleActive}>
          {u.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>

      {showPreview && photoUrl && (
        <div className="image-modal-backdrop" onClick={() => setShowPreview(false)}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPreview(false)} aria-label="Close preview">×</button>
            <img src={photoUrl} alt="Profile large" className="image-large" />
          </div>
        </div>
      )}
    </div>
  );
}
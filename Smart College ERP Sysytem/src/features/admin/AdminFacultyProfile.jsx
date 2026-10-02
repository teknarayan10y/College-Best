// src/features/admin/AdminFacultyProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../auth/api";
import "./AdminFacultyProfile.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function AdminFacultyProfile() {
  const { facultyId } = useParams(); // holds userId
  const [data, setData] = useState({ user: null, profile: null });
  const [form, setForm] = useState({});
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  async function load() {
    setErr(""); setOk("");
    const res = await api.adminFacultyProfile(facultyId);
    setData({ user: res.user, profile: res.profile });
    setForm({ ...(res.profile || {}) });
  }

  useEffect(() => {
    load().catch(e => setErr(e.message || "Failed to load"));
  }, [facultyId]);

  const u = data.user || {};
  const p = data.profile || {};
  const photoUrl = toAbsoluteUploadUrl(p.profileImage) || "";

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const onSave = async () => {
    try {
      setSaving(true); setErr(""); setOk("");
      await api.adminUpdateFacultyProfile(facultyId, {
        facultyId: form.facultyId,
        department: form.department,
        designation: form.designation,
        phone: form.phone,
        qualification: form.qualification,
        experienceYears: form.experienceYears,
        experienceSummary: form.experienceSummary,
        employmentStatus: form.employmentStatus,
        github: form.github,
        linkedin: form.linkedin,
        portfolio: form.portfolio,
        remarks: form.remarks,
        teachingSubjects: form.teachingSubjects, // array or string accepted by backend normalization
      });
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
      await api.adminUpdateFacultyStatus(facultyId, next);
      setOk(next ? "User activated" : "User deactivated");
      await load();
    } catch (e) {
      setErr(e.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const onClosePreview = () => setShowPreview(false);
  const onRemovePhoto = async () => {
    if (!window.confirm("Remove profile photo?")) return;
    try {
      setSaving(true); setErr(""); setOk("");
      await api.adminUpdateFacultyProfile(facultyId, { profileImage: "" });
      setOk("Profile photo removed");
      setShowPreview(false);
      await load();
    } catch (e) {
      setErr(e.message || "Failed to remove photo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-faculty-profile">
      <h1>Faculty Profile</h1>
      {err && <div className="form-error">{err}</div>}
      {ok && <div className="form-ok">{ok}</div>}

      <div className="profile-card">
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
            <div><strong>Faculty ID:</strong> {p.facultyId || "-"}</div>
            <div><strong>Department:</strong> {p.department || "-"}</div>
            <div><strong>Designation:</strong> {p.designation || "-"}</div>
            <div><strong>Phone:</strong> {p.phone || "-"}</div>
            <div><strong>Highest Qualification:</strong> {p.qualification || "-"}</div>
            <div><strong>Experience (years):</strong> {p.experienceYears ?? "-"}</div>
            <div><strong>Experience Summary:</strong> {p.experienceSummary || "-"}</div>
            <div><strong>Employment Status:</strong> {p.employmentStatus || "-"}</div>
            <div><strong>Teaching Subjects:</strong> {Array.isArray(p.teachingSubjects) ? p.teachingSubjects.join(", ") : (p.teachingSubjects || "-")}</div>
            <div><strong>GitHub:</strong> {p.github || "-"}</div>
            <div><strong>LinkedIn:</strong> {p.linkedin || "-"}</div>
            <div><strong>Portfolio:</strong> {p.portfolio || "-"}</div>
            <div><strong>Remarks:</strong> {p.remarks || "-"}</div>
          </>
        ) : (
          <div className="grid-2">
            <label className="field"><span>Faculty ID</span>
              <input name="facultyId" value={form.facultyId || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Department</span>
              <input name="department" value={form.department || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Designation</span>
              <input name="designation" value={form.designation || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Phone</span>
              <input name="phone" value={form.phone || ""} onChange={onChange} />
            </label>

            <label className="field"><span>Highest Qualification</span>
              <input name="qualification" value={form.qualification || ""} onChange={onChange} />
            </label>
            <label className="field"><span>Experience (years)</span>
              <input name="experienceYears" value={form.experienceYears ?? ""} onChange={onChange} />
            </label>
            <label className="field col-span-2"><span>Experience Summary</span>
              <input name="experienceSummary" value={form.experienceSummary || ""} onChange={onChange} />
            </label>

            <label className="field"><span>Employment Status</span>
              <select className="input" name="employmentStatus" value={form.employmentStatus || "active"} onChange={onChange}>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="resigned">Resigned</option>
              </select>
            </label>

            <label className="field col-span-2"><span>Teaching Subjects (comma-separated)</span>
              <input
                name="teachingSubjects"
                value={
                  Array.isArray(form.teachingSubjects)
                    ? form.teachingSubjects.join(", ")
                    : (form.teachingSubjects || "")
                }
                onChange={(e) => {
                  const txt = e.target.value;
                  setForm(f => ({
                    ...f,
                    teachingSubjects: txt.split(",").map(s => s.trim()).filter(Boolean)
                  }));
                }}
              />
            </label>

            <label className="field"><span>GitHub</span>
              <input name="github" value={form.github || ""} onChange={onChange} />
            </label>
            <label className="field"><span>LinkedIn</span>
              <input name="linkedin" value={form.linkedin || ""} onChange={onChange} />
            </label>
            <label className="field col-span-2"><span>Portfolio</span>
              <input name="portfolio" value={form.portfolio || ""} onChange={onChange} />
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
        <div className="image-modal-backdrop" onClick={onClosePreview}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={onClosePreview} aria-label="Close preview">×</button>
            <img src={photoUrl} alt="Profile large" className="image-large" />
            <div className="modal-actions">
              <button className="btn secondary" onClick={onRemovePhoto} disabled={saving}>
                {saving ? "Removing…" : "Remove Photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
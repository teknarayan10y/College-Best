// src/features/student/StudentProfile.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../auth/api";
import { getUser, setUser } from "../../auth/storage";
import "./StudentProfile.css";
import StudentBiometricsSection from "./StudentBiometricsSection";

function splitName(name) {
  const parts = (name || "").trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

// Convert "/uploads/..." to absolute API URL in dev/prod
function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  // Drop trailing /api if present to point to the server origin for static files
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

export default function StudentProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  const [editMode, setEditMode] = useState({
    personal: false,
    contact: false,
    academic: false,
    professional: false,
    other: false,
  });

  const [form, setForm] = useState({
    // Personal
    firstName: "",
    lastName: "",
    gender: "",
    dob: "",
    bloodGroup: "",
    nationality: "",

    // Contact
    email: "",
    phone: "",
    altPhone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",

    // Academic
    studentId: "",         // NEW: visible, read-only
    registerNumber: "",
    rollNo: "",
    program: "",
    branch: "",            // NEW: replacing Department in UI
    department: "",        // kept for backward compatibility if present in DB
    semester: "",
    section: "",
    year: "",              // NEW
    admissionYear: "",
    passoutYear: "",
    cgpa: "",

    // Professional
    profileImage: null,          // File object when chosen
    profileImagePreview: "",     // local preview URL
    profileImageUrl: "",         // persisted absolute URL
    github: "",
    linkedin: "",
    portfolio: "",
    leetcode: "",
    hackerrank: "",
    codechef: "",
    codeforces: "",
    kaggle: "",
    resumeLink: "",

    // Other
    aadhaar: "",
    hobbies: "",
    achievements: "",
    remarks: "",
  });

  useEffect(() => {
    (async () => {
      try {
        // 1) Prefill from cached user (login info)
        const cached = getUser();
        if (cached) {
          const { firstName, lastName } = splitName(cached.name);
          setForm((f) => ({
            ...f,
            firstName,
            lastName,
            email: cached.email || f.email,
          }));
        }

        // 2) Refresh from server (authoritative user info)
        try {
          const me = await api.me();
          if (me?.user) {
            const { firstName, lastName } = splitName(me.user.name);
            setForm((f) => ({
              ...f,
              firstName,
              lastName,
              email: me.user.email || f.email,
            }));
            setUser(me.user);
          }
        } catch {}

        // 3) Load persisted profile
        try {
          const res = await api.profileGet(); // { profile }
          if (res?.profile) {
            const p = res.profile;
            setForm((f) => ({
              ...f,
              ...p,
              // Map and prefer branch over department for UI
              branch: p.branch || p.department || f.branch,
              // Include year if present
              year: p.year || f.year,
              // Ensure Student ID is preserved/showing
              studentId: p.studentId || f.studentId,
              profileImageUrl: toAbsoluteUploadUrl(p.profileImage || f.profileImageUrl),
            }));
          }
        } catch {}
      } catch (e) {
        setErr(e.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- HANDLERS ----------
  const onChange = (e) => {
    let { name, value } = e.target;
    if (name === "gender") value = value.toLowerCase();
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const MAX_SIZE = 2 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);

  const onImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setErr('Invalid image type. Please select JPG, PNG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setErr('Image is too large. Max size is 2 MB.');
      return;
    }

    setErr('');
    setForm((prev) => ({
      ...prev,
      profileImage: file,
      profileImagePreview: URL.createObjectURL(file),
    }));
  };

  const toggleEdit = (section) => {
    setEditMode((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");
    try {
      setSaving(true);

      // If a new file selected, send multipart/form-data; otherwise JSON
      if (form.profileImage instanceof File) {
        const fd = new FormData();
        fd.append("profileImage", form.profileImage);
        const keys = [
          // Personal
          "firstName","lastName","gender","dob","bloodGroup","nationality",
          // Contact
          "email","phone","altPhone","address","city","state","pincode",
          // Academic (student can edit these; DO NOT include studentId)
          "registerNumber","rollNo","program",
          "branch","semester","section","year",
          "admissionYear","passoutYear","cgpa",
          // Professional/Links/Other
          "github","linkedin","portfolio","leetcode","hackerrank","codechef","codeforces","kaggle","resumeLink",
          "aadhaar","hobbies","achievements","remarks",
        ];
        keys.forEach((k) => {
          if (form[k] !== undefined && form[k] !== null) fd.append(k, String(form[k]));
        });

        const res = await api.profilePutForm(fd);
        if (res?.profile) {
          const raw = res.profile.profileImage || "";
          const abs = toAbsoluteUploadUrl(raw);
          const bust = abs ? `${abs}?t=${Date.now()}` : "";
          setForm((f) => ({
            ...f,
            ...res.profile,
            // Keep UI expectations: map branch/department and year and studentId
            branch: res.profile.branch || res.profile.department || f.branch,
            year: res.profile.year || f.year,
            studentId: res.profile.studentId || f.studentId,
            profileImage: null,
            profileImagePreview: "",
            profileImageUrl: bust || f.profileImageUrl,
          }));
          if (bust) {
            localStorage.setItem("profile_photo_url", bust);
            window.dispatchEvent(new Event("profile-photo-updated"));
          }
        }
      } else {
        const payload = { ...form };
        // Exclude preview-only and read-only fields
        delete payload.profileImagePreview;
        delete payload.profileImage;
        delete payload.profileImageUrl;
        delete payload.studentId; // IMPORTANT: do not let student change ID

        const res = await api.profilePut(payload);
        if (res?.profile) {
          const raw = res.profile.profileImage || "";
          const abs = toAbsoluteUploadUrl(raw);
          const bust = abs ? `${abs}?t=${Date.now()}` : "";
          setForm((f) => ({
            ...f,
            ...res.profile,
            // Keep UI expectations
            branch: res.profile.branch || res.profile.department || f.branch,
            year: res.profile.year || f.year,
            studentId: res.profile.studentId || f.studentId,
            profileImageUrl: bust || f.profileImageUrl,
          }));
          if (bust) {
            localStorage.setItem("profile_photo_url", bust);
            window.dispatchEvent(new Event("profile-photo-updated"));
          }
        }
      }

      setOk("Profile updated successfully");
      setEditMode({
        personal: false,
        contact: false,
        academic: false,
        professional: false,
        other: false,
      });
    } catch (e) {
      setErr(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-wrap">
        <div className="profile-skeleton">Loading…</div>
      </div>
    );
  }

  // Prefer preview > persisted url > initial
  const avatarContent = form.profileImagePreview
    ? <img src={form.profileImagePreview} alt="Profile" />
    : form.profileImageUrl
      ? <img src={form.profileImageUrl} alt="Profile" />
      : (form.firstName || "S")[0];

  return (
    <div className="profile-wrap">
      {/* HEADER */}
      <div className="profile-header">
        <div className="avatar-xl">
          {avatarContent}
        </div>
        <div>
          <h1>My Profile</h1>
          <p>Manage your student & professional details</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* LEFT MENU */}
        <aside className="profile-menu">
          <button className={activeTab === "personal" ? "active" : ""} onClick={() => setActiveTab("personal")}>👤 Personal</button>
          <button className={activeTab === "contact" ? "active" : ""} onClick={() => setActiveTab("contact")}>📞 Contact</button>
          <button className={activeTab === "academic" ? "active" : ""} onClick={() => setActiveTab("academic")}>🎓 Academic</button>
          <button type="button" className={activeTab === "professional" ? "active" : ""} onClick={() => setActiveTab("professional")}>💼 Professional</button>
          <button type="button" className={activeTab === "biometrics" ? "active" : ""} onClick={() => setActiveTab("biometrics")}>⚡ Face & Voice ID</button>
          <button type="button" className={activeTab === "other" ? "active" : ""} onClick={() => setActiveTab("other")}>🧩 Other</button>
        </aside>

        {/* RIGHT CONTENT */}
        <form className="profile-form" onSubmit={onSubmit}>
          {/* BIOMETRICS */}
          {activeTab === "biometrics" && (
            <StudentBiometricsSection
              profile={form}
              onUpdated={(res) => {
                setForm((prev) => ({
                  ...prev,
                  biometricRegistered: res.biometricRegistered,
                  hasFace: res.hasFace,
                  hasVoice: res.hasVoice
                }));
              }}
            />
          )}

          {/* PERSONAL */}
          {activeTab === "personal" && (
            <Section title="Personal Details" editing={editMode.personal} onEdit={() => toggleEdit("personal")}>
              <Grid>
                <Input label="First Name" name="firstName" value={form.firstName} onChange={onChange} readOnly={!editMode.personal} />
                <Input label="Last Name" name="lastName" value={form.lastName} onChange={onChange} readOnly={!editMode.personal} />

                {/* Gender dropdown */}
                <label className="field">
                  <span>Gender</span>
                  <select
                    className="input"
                    name="gender"
                    value={form.gender}
                    onChange={onChange}
                    disabled={!editMode.personal}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <Input type="date" label="DOB" name="dob" value={form.dob} onChange={onChange} readOnly={!editMode.personal} />
                <Input label="Blood Group" name="bloodGroup" value={form.bloodGroup} onChange={onChange} readOnly={!editMode.personal} />
                <Input label="Nationality" name="nationality" value={form.nationality} onChange={onChange} readOnly={!editMode.personal} />
              </Grid>
            </Section>
          )}

          {/* CONTACT */}
          {activeTab === "contact" && (
            <Section title="Contact Details" editing={editMode.contact} onEdit={() => toggleEdit("contact")}>
              <Grid>
                <Input label="Email" name="email" value={form.email} onChange={onChange} readOnly={!editMode.contact} />
                <Input label="Mobile" name="phone" value={form.phone} onChange={onChange} readOnly={!editMode.contact} />
                <Input label="Alternate Mobile" name="altPhone" value={form.altPhone} onChange={onChange} readOnly={!editMode.contact} />
                <Input label="Address" name="address" value={form.address} onChange={onChange} readOnly={!editMode.contact} col />
                <Input label="City" name="city" value={form.city} onChange={onChange} readOnly={!editMode.contact} />
                <Input label="State" name="state" value={form.state} onChange={onChange} readOnly={!editMode.contact} />
                <Input label="Pincode" name="pincode" value={form.pincode} onChange={onChange} readOnly={!editMode.contact} />
              </Grid>
            </Section>
          )}

          {/* ACADEMIC */}
          {activeTab === "academic" && (
            <Section title="Academic Details" editing={editMode.academic} onEdit={() => toggleEdit("academic")}>
              <Grid>
                {/* NEW: Student ID (read-only) */}
                <Input label="Student ID" name="studentId" value={form.studentId} onChange={onChange} readOnly={true} disabled={true} />

                <Input label="Register No" name="registerNumber" value={form.registerNumber} onChange={onChange} readOnly={true} disabled={true} />
                <Input label="Roll No" name="rollNo" value={form.rollNo} onChange={onChange} readOnly={true} disabled={true}/>
                <Input label="Program" name="program" value={form.program} onChange={onChange} readOnly={!editMode.academic} />

                {/* CHANGED: Department -> Branch */}
                <Input label="Branch" name="branch" value={form.branch} onChange={onChange} readOnly={true} disabled={true} />

                <Input label="Semester" name="semester" value={form.semester} onChange={onChange} readOnly={true} disabled={true} />
                <Input label="Section" name="section" value={form.section} onChange={onChange} readOnly={true} disabled={true} />

                {/* NEW: Year */}
                <Input label="Year" name="year" value={form.year} onChange={onChange} readOnly={true} disabled={true}  />

                <Input label="CGPA" name="cgpa" value={form.cgpa} onChange={onChange} readOnly={true} disabled={true} />
                <Input label="AdmissionYear" name="admissionYear" value={form.admissionYear} onChange={onChange} readOnly={true} disabled={true} />
                <Input label="PassoutYear" name="passoutYear" value={form.passoutYear} onChange={onChange} readOnly={true} disabled={true} />
              </Grid>
            </Section>
          )}

          {/* PROFESSIONAL */}
          {activeTab === "professional" && (
            <Section title="Professional Details" editing={editMode.professional} onEdit={() => toggleEdit("professional")}>
              {/* PROFILE PHOTO */}
              <div className="profile-photo-box">
                <div className="photo-preview">
                  {form.profileImagePreview
                    ? <img src={form.profileImagePreview} alt="Profile" />
                    : form.profileImageUrl
                      ? <img src={form.profileImageUrl} alt="Profile" />
                      : <span>No Photo</span>
                  }
                </div>
                {editMode.professional && (
                  <label className="upload-btn">
                    Upload Photo
                    <input type="file" accept="image/*" hidden onChange={onImageChange} />
                  </label>
                )}
              </div>

              <Grid>
                <Input label="GitHub" name="github" value={form.github} onChange={onChange} readOnly={!editMode.professional} />
                <Input label="LinkedIn" name="linkedin" value={form.linkedin} onChange={onChange} readOnly={!editMode.professional} />
                <Input label="Portfolio" name="portfolio" value={form.portfolio} onChange={onChange} readOnly={!editMode.professional} />
                <Input label="LeetCode" name="leetcode" value={form.leetcode} onChange={onChange} readOnly={!editMode.professional} />
                <Input label="Resume Link" name="resumeLink" value={form.resumeLink} onChange={onChange} readOnly={!editMode.professional} col />
              </Grid>
            </Section>
          )}

          {/* OTHER */}
          {activeTab === "other" && (
            <Section title="Other Information" editing={editMode.other} onEdit={() => toggleEdit("other")}>
              <Grid>
                <Input label="Aadhaar" name="aadhaar" value={form.aadhaar} onChange={onChange} readOnly={!editMode.other} />
                <Input label="Hobbies" name="hobbies" value={form.hobbies} onChange={onChange} readOnly={!editMode.other} />
                <Input label="Achievements" name="achievements" value={form.achievements} onChange={onChange} readOnly={!editMode.other} col />
                <Input label="Remarks" name="remarks" value={form.remarks} onChange={onChange} readOnly={!editMode.other} col />
              </Grid>
            </Section>
          )}

          {err && <div className="form-error">{err}</div>}
          {ok && <div className="form-ok">{ok}</div>}

          <div className="profile-actions">
            <button className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save All Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- REUSABLES ---------- */
function Section({ title, children, editing, onEdit }) {
  return (
    <section className="profile-section">
      <div className="section-header">
        <h2>{title}</h2>
        <button type="button" className="btn small ghost" onClick={onEdit}>
          {editing ? "Save" : "Edit"}
        </button>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid-2">{children}</div>;
}

function Input({ label, name, value, onChange, type = "text", col, readOnly, disabled }) {
  return (
    <label className={`field ${col ? "col-span-2" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
        className={readOnly ? "readonly" : ""}
      />
    </label>
  );
}
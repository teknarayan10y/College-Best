// src/features/faculty/FacultyProfile.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../auth/api";
import { getUser, setUser } from "../../auth/storage";
import StudentBiometricsSection from "../student/StudentBiometricsSection";
import "../student/StudentProfile.css";

function toAbsoluteUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const filesBase = apiBase.replace(/\/api$/i, "");
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${filesBase}${rel}`;
}

function splitName(name) {
  const parts = (name || "").trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

export default function FacultyProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  const [editMode, setEditMode] = useState({
    personal: false,
    contact: false,
    faculty: false,
    career: false,
    social: false,
    other: false,
  });

  const [profileData, setProfileData] = useState(null);

  const [form, setForm] = useState({
    // Personal
    firstName: "",
    lastName: "",
    gender: "",
    dob: "",
    bloodGroup: "",
    // Contact
    email: "",
    phone: "",
    altPhone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    // Faculty
    facultyId: "",
    department: "",
    designation: "",
    // Photo
    profileImage: null,
    profileImagePreview: "",
    profileImageUrl: "",
    // Social
    github: "",
    linkedin: "",
    portfolio: "",
    // Career
    qualification: "",
    experienceYears: "",
    experienceSummary: "",
    employmentStatus: "active",
    // Teaching subjects UI text
    teachingSubjectsText: "",
    // Misc
    remarks: "",
  });

  const [newPhotoFile, setNewPhotoFile] = useState(null);

  const onChange = (e) => {
    let { name, value } = e.target;
    if (name === "gender") value = value.toLowerCase();
    setForm(f => ({ ...f, [name]: value }));
  };

  const toggleEdit = (section) => {
    setEditMode(prev => ({ ...prev, [section]: !prev[section] }));
  };

  async function reloadProfile() {
    let u = getUser() || {};
    try {
      const me = await api.me();
      if (me?.user) {
        u = { ...u, ...me.user };
        setUser(me.user);
      }
    } catch {}

    const res = await api.facultyProfileGet();
    const p = res?.profile || {};
    if (res?.user) {
      u = { ...u, ...res.user };
      setUser(res.user);
    }

    const mergedBiometrics = {
      ...p,
      faceEmbedding: p?.faceEmbedding || res?.user?.faceEmbedding,
      voiceEmbedding: p?.voiceEmbedding || res?.user?.voiceEmbedding,
      biometricRegistered: p?.biometricRegistered || res?.user?.biometricRegistered
    };
    setProfileData(mergedBiometrics);

    const names = splitName(u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim());
    const profileImageUrl = toAbsoluteUploadUrl(p.profileImage) || "";

    const teachingSubjectsText = Array.isArray(p.teachingSubjects)
      ? p.teachingSubjects.join(", ")
      : (p.teachingSubjects || "");

    const finalFirstName = p.firstName || u.firstName || names.firstName || "";
    const finalLastName = p.lastName || u.lastName || names.lastName || "";
    const finalEmail = p.email || u.email || "";

    setForm(f => ({
      ...f,
      firstName: finalFirstName,
      lastName: finalLastName,
      gender: p.gender || "",
      dob: p.dob || "",
      bloodGroup: p.bloodGroup || "",
      email: finalEmail,
      phone: p.phone || "",
      altPhone: p.altPhone || "",
      address: p.address || "",
      city: p.city || "",
      state: p.state || "",
      pincode: p.pincode || "",
      facultyId: p.facultyId || "",
      department: p.department || "",
      designation: p.designation || "",
      profileImage: null,
      profileImagePreview: "",
      profileImageUrl,
      github: p.github || "",
      linkedin: p.linkedin || "",
      portfolio: p.portfolio || "",
      qualification: p.qualification || "",
      experienceYears: p.experienceYears ?? "",
      experienceSummary: p.experienceSummary || "",
      employmentStatus: p.employmentStatus || "active",
      teachingSubjectsText,
      remarks: p.remarks || "",
    }));

    if (profileImageUrl) {
      localStorage.setItem("faculty_photo_url", profileImageUrl);
      window.dispatchEvent(new CustomEvent("faculty-photo-updated", { detail: { url: profileImageUrl } }));
      window.dispatchEvent(new CustomEvent("profile-photo-updated", { detail: { url: profileImageUrl } }));
    }
    const displayName = `${finalFirstName} ${finalLastName}`.trim();
    if (displayName) localStorage.setItem("faculty_name", displayName);
    if (finalEmail) localStorage.setItem("faculty_email", finalEmail);
    window.dispatchEvent(new Event("profile-info-updated"));
  }

  useEffect(() => {
    setLoading(true);
    setErr("");
    setOk("");
    reloadProfile()
      .catch(e => setErr(e.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, profileImagePreview: reader.result }));
    reader.readAsDataURL(file);
  };

  const onSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      setSaving(true);
      setErr("");
      setOk("");

      const subjects = (form.teachingSubjectsText || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (newPhotoFile) {
        const fd = new FormData();
        const keys = [
          "firstName", "lastName", "gender", "dob", "bloodGroup",
          "email", "phone", "altPhone", "address", "city", "state", "pincode",
          "department", "designation",
          "qualification", "experienceYears", "experienceSummary", "employmentStatus",
          "github", "linkedin", "portfolio", "remarks"
        ];
        keys.forEach(k => {
          const v = form[k];
          if (v !== undefined && v !== null) fd.append(k, v);
        });

        fd.append("teachingSubjects", JSON.stringify(subjects));
        fd.append("profileImage", newPhotoFile);

        const res = await api.facultyProfilePutForm(fd);
        if (res?.user) setUser(res.user);
      } else {
        const {
          facultyId, teachingSubjectsText, profileImage, profileImagePreview, profileImageUrl,
          ...rest
        } = form;

        const res = await api.facultyProfilePut({
          ...rest,
          teachingSubjects: subjects,
        });
        if (res?.user) setUser(res.user);
      }

      setOk("Profile updated successfully!");
      setEditMode({
        personal: false,
        contact: false,
        faculty: false,
        career: false,
        social: false,
        other: false,
      });
      await reloadProfile();
    } catch (e) {
      setErr(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
      setNewPhotoFile(null);
    }
  };

  if (loading) {
    return (
      <div className="profile-wrap">
        <div className="profile-skeleton">Loading faculty profile…</div>
      </div>
    );
  }

  const avatarContent = form.profileImagePreview ? (
    <img src={form.profileImagePreview} alt="Profile" />
  ) : form.profileImageUrl ? (
    <img src={form.profileImageUrl} alt="Profile" />
  ) : (
    (form.firstName || "F")[0]
  );

  return (
    <div className="profile-wrap">
      {/* HEADER (CARD STYLE) */}
      <div className="profile-header">
        <div className="avatar-xl">
          {avatarContent}
        </div>
        <div>
          <h1>Faculty Profile</h1>
          <p>Manage your teaching details, academic credentials & biometric identity</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* LEFT MENU TABS */}
        <aside className="profile-menu">
          <button
            type="button"
            className={activeTab === "personal" ? "active" : ""}
            onClick={() => setActiveTab("personal")}
          >
            👤 Personal
          </button>
          <button
            type="button"
            className={activeTab === "contact" ? "active" : ""}
            onClick={() => setActiveTab("contact")}
          >
            📞 Contact
          </button>
          <button
            type="button"
            className={activeTab === "faculty" ? "active" : ""}
            onClick={() => setActiveTab("faculty")}
          >
            👨‍🏫 Faculty Details
          </button>
          <button
            type="button"
            className={activeTab === "career" ? "active" : ""}
            onClick={() => setActiveTab("career")}
          >
            💼 Career & Subjects
          </button>
          <button
            type="button"
            className={activeTab === "social" ? "active" : ""}
            onClick={() => setActiveTab("social")}
          >
            🌐 Social & Photo
          </button>
          <button
            type="button"
            className={activeTab === "biometrics" ? "active" : ""}
            onClick={() => setActiveTab("biometrics")}
          >
            ⚡ Face & Voice ID
          </button>
          <button
            type="button"
            className={activeTab === "other" ? "active" : ""}
            onClick={() => setActiveTab("other")}
          >
            🧩 Other
          </button>
        </aside>

        {/* RIGHT CONTENT */}
        <form className="profile-form" onSubmit={onSave}>
          {/* BIOMETRICS */}
          {activeTab === "biometrics" && (
            <StudentBiometricsSection
              profile={profileData || form}
              onUpdated={reloadProfile}
            />
          )}

          {/* PERSONAL */}
          {activeTab === "personal" && (
            <Section
              title="Personal Details"
              editing={editMode.personal}
              onEdit={() => toggleEdit("personal")}
            >
              <Grid>
                <Input
                  label="First Name"
                  name="firstName"
                  value={form.firstName}
                  onChange={onChange}
                  readOnly={!editMode.personal}
                />
                <Input
                  label="Last Name"
                  name="lastName"
                  value={form.lastName}
                  onChange={onChange}
                  readOnly={!editMode.personal}
                />
                <label className="field">
                  <span>Gender</span>
                  <select
                    className="input"
                    name="gender"
                    value={form.gender || ""}
                    onChange={onChange}
                    disabled={!editMode.personal}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <Input
                  type="date"
                  label="Date of Birth"
                  name="dob"
                  value={form.dob}
                  onChange={onChange}
                  readOnly={!editMode.personal}
                />
                <Input
                  label="Blood Group"
                  name="bloodGroup"
                  value={form.bloodGroup}
                  onChange={onChange}
                  readOnly={!editMode.personal}
                />
              </Grid>
            </Section>
          )}

          {/* CONTACT */}
          {activeTab === "contact" && (
            <Section
              title="Contact Details"
              editing={editMode.contact}
              onEdit={() => toggleEdit("contact")}
            >
              <Grid>
                <Input
                  label="Email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
                <Input
                  label="Mobile"
                  name="phone"
                  value={form.phone}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
                <Input
                  label="Alternate Mobile"
                  name="altPhone"
                  value={form.altPhone}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
                <Input
                  label="Address"
                  name="address"
                  value={form.address}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                  col
                />
                <Input
                  label="City"
                  name="city"
                  value={form.city}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
                <Input
                  label="State"
                  name="state"
                  value={form.state}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
                <Input
                  label="Pincode"
                  name="pincode"
                  value={form.pincode}
                  onChange={onChange}
                  readOnly={!editMode.contact}
                />
              </Grid>
            </Section>
          )}

          {/* FACULTY DETAILS */}
          {activeTab === "faculty" && (
            <Section
              title="Faculty & Department"
              editing={editMode.faculty}
              onEdit={() => toggleEdit("faculty")}
            >
              <Grid>
                <Input
                  label="Faculty ID"
                  name="facultyId"
                  value={form.facultyId}
                  onChange={onChange}
                  readOnly={true}
                  disabled={true}
                />
                <Input
                  label="Department"
                  name="department"
                  value={form.department}
                  onChange={onChange}
                  readOnly={!editMode.faculty}
                />
                <Input
                  label="Designation"
                  name="designation"
                  value={form.designation}
                  onChange={onChange}
                  readOnly={!editMode.faculty}
                />
                <label className="field">
                  <span>Employment Status</span>
                  <select
                    className="input"
                    name="employmentStatus"
                    value={form.employmentStatus || "active"}
                    onChange={onChange}
                    disabled={!editMode.faculty}
                  >
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="resigned">Resigned</option>
                  </select>
                </label>
              </Grid>
            </Section>
          )}

          {/* CAREER & SUBJECTS */}
          {activeTab === "career" && (
            <Section
              title="Career & Teaching Subjects"
              editing={editMode.career}
              onEdit={() => toggleEdit("career")}
            >
              <Grid>
                <Input
                  label="Highest Qualification"
                  name="qualification"
                  value={form.qualification}
                  onChange={onChange}
                  readOnly={!editMode.career}
                />
                <Input
                  label="Experience (Years)"
                  name="experienceYears"
                  value={form.experienceYears}
                  onChange={onChange}
                  readOnly={!editMode.career}
                />
                <Input
                  label="Experience Summary"
                  name="experienceSummary"
                  value={form.experienceSummary}
                  onChange={onChange}
                  readOnly={!editMode.career}
                  col
                />
                <Input
                  label="Teaching Subjects (comma separated)"
                  name="teachingSubjectsText"
                  value={form.teachingSubjectsText}
                  onChange={onChange}
                  readOnly={!editMode.career}
                  col
                />
              </Grid>
            </Section>
          )}

          {/* SOCIAL & PHOTO */}
          {activeTab === "social" && (
            <Section
              title="Social & Profile Photo"
              editing={editMode.social}
              onEdit={() => toggleEdit("social")}
            >
              {/* Photo Box */}
              <div className="profile-photo-box">
                <div className="photo-preview">
                  {form.profileImagePreview ? (
                    <img src={form.profileImagePreview} alt="Preview" />
                  ) : form.profileImageUrl ? (
                    <img src={form.profileImageUrl} alt="Current" />
                  ) : (
                    <span>No Photo</span>
                  )}
                </div>
                {editMode.social && (
                  <label className="upload-btn">
                    Choose New Photo
                    <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
                  </label>
                )}
              </div>

              <Grid>
                <Input
                  label="GitHub"
                  name="github"
                  value={form.github}
                  onChange={onChange}
                  readOnly={!editMode.social}
                />
                <Input
                  label="LinkedIn"
                  name="linkedin"
                  value={form.linkedin}
                  onChange={onChange}
                  readOnly={!editMode.social}
                />
                <Input
                  label="Portfolio Website"
                  name="portfolio"
                  value={form.portfolio}
                  onChange={onChange}
                  readOnly={!editMode.social}
                  col
                />
              </Grid>
            </Section>
          )}

          {/* OTHER */}
          {activeTab === "other" && (
            <Section
              title="Other Information"
              editing={editMode.other}
              onEdit={() => toggleEdit("other")}
            >
              <Grid>
                <Input
                  label="Remarks & Notes"
                  name="remarks"
                  value={form.remarks}
                  onChange={onChange}
                  readOnly={!editMode.other}
                  col
                />
              </Grid>
            </Section>
          )}

          {err && <div className="form-error">{err}</div>}
          {ok && <div className="form-ok">{ok}</div>}

          {activeTab !== "biometrics" && (
            <div className="profile-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving…" : "Save All Changes"}
              </button>
            </div>
          )}
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
        {onEdit && (
          <button type="button" className="btn small ghost" onClick={onEdit}>
            {editing ? "Save" : "Edit"}
          </button>
        )}
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
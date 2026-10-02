// src/features/admin/AdminProfile.jsx
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../../auth/api";
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

export default function AdminProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  const [editMode, setEditMode] = useState({
    personal: false,
    contact: false,
    administrative: false,
    photo: false,
  });

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Form state
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    dob: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    qualification: "",
    institution: "",
    passingYear: "",
    profileImageUrl: "",
    profileImagePreview: "",
  });

  const [newPhotoFile, setNewPhotoFile] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const toggleEdit = (section) => {
    setEditMode(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setOk("");

    let u = null;
    let p = null;

    try {
      try {
        const r = await api.me();
        u = r?.user || null;
      } catch {}

      try {
        const r2 = await api.profileGet();
        p = r2?.profile || null;
      } catch (e) {
        if (!u) setErr(e.message || "Failed to load profile");
      }

      const names = splitName(u?.name);
      const profileImageUrl = toAbsoluteUploadUrl(p?.profileImage) || "";

      setUser(u);
      setProfile(p);
      setForm(f => ({
        ...f,
        firstName: p?.firstName || u?.firstName || names.firstName || "",
        lastName: p?.lastName || u?.lastName || names.lastName || "",
        gender: p?.gender || u?.gender || "",
        dob: p?.dob || u?.dob || "",
        phone: p?.phone || "",
        address: p?.address || "",
        city: p?.city || "",
        state: p?.state || "",
        pincode: p?.pincode || "",
        qualification: p?.qualification || "",
        institution: p?.institution || "",
        passingYear: p?.passingYear || "",
        profileImageUrl,
        profileImagePreview: "",
      }));

      if (profileImageUrl) {
        localStorage.setItem("admin_profile_image", profileImageUrl);
        window.dispatchEvent(new CustomEvent("profile-photo-updated", { detail: { url: profileImageUrl } }));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      if (newPhotoFile) {
        const fd = new FormData();
        const keys = [
          "firstName", "lastName", "gender", "dob",
          "phone", "address", "city", "state", "pincode",
          "qualification", "institution", "passingYear",
        ];
        keys.forEach(k => {
          const v = form[k];
          if (v !== undefined && v !== null) fd.append(k, v);
        });

        fd.append("profileImage", newPhotoFile);
        await api.profilePutForm(fd);
      } else {
        await api.profilePut({
          firstName: form.firstName,
          lastName: form.lastName,
          gender: form.gender,
          dob: form.dob,
          phone: form.phone,
          address: form.address,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          qualification: form.qualification,
          institution: form.institution,
          passingYear: form.passingYear,
        });
      }

      setOk("Admin profile updated successfully!");
      setEditMode({
        personal: false,
        contact: false,
        administrative: false,
        photo: false,
      });

      await load();
      setNewPhotoFile(null);
    } catch (e) {
      setErr(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-wrap">
        <div className="profile-skeleton">Loading admin profile…</div>
      </div>
    );
  }

  const avatarContent = form.profileImagePreview ? (
    <img src={form.profileImagePreview} alt="Profile" />
  ) : form.profileImageUrl ? (
    <img src={form.profileImageUrl} alt="Profile" />
  ) : (
    (form.firstName || user?.name || "A")[0]
  );

  return (
    <div className="profile-wrap">
      {/* HEADER (CARD STYLE) */}
      <div className="profile-header">
        <div className="avatar-xl">
          {avatarContent}
        </div>
        <div>
          <h1>Admin Profile</h1>
          <p>Manage system credentials, institution details & biometric identity</p>
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
            className={activeTab === "administrative" ? "active" : ""}
            onClick={() => setActiveTab("administrative")}
          >
            🏢 Administrative
          </button>
          <button
            type="button"
            className={activeTab === "photo" ? "active" : ""}
            onClick={() => setActiveTab("photo")}
          >
            📷 Profile Photo
          </button>
          <button
            type="button"
            className={activeTab === "biometrics" ? "active" : ""}
            onClick={() => setActiveTab("biometrics")}
          >
            ⚡ Face & Voice ID
          </button>
        </aside>

        {/* RIGHT CONTENT */}
        <form className="profile-form" onSubmit={onSave}>
          {/* BIOMETRICS */}
          {activeTab === "biometrics" && (
            <StudentBiometricsSection
              profile={profile || user}
              onUpdated={load}
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
                  label="Email (System User)"
                  name="email"
                  value={user?.email || ""}
                  onChange={() => {}}
                  readOnly={true}
                  disabled={true}
                />
                <Input
                  label="Phone Number"
                  name="phone"
                  value={form.phone}
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

          {/* ADMINISTRATIVE */}
          {activeTab === "administrative" && (
            <Section
              title="Administrative & Education Details"
              editing={editMode.administrative}
              onEdit={() => toggleEdit("administrative")}
            >
              <Grid>
                <Input
                  label="System Role"
                  name="role"
                  value="Administrator (Superuser)"
                  onChange={() => {}}
                  readOnly={true}
                  disabled={true}
                />
                <Input
                  label="Institution"
                  name="institution"
                  value={form.institution}
                  onChange={onChange}
                  readOnly={!editMode.administrative}
                />
                <Input
                  label="Highest Qualification"
                  name="qualification"
                  value={form.qualification}
                  onChange={onChange}
                  readOnly={!editMode.administrative}
                />
                <Input
                  label="Passing Year"
                  name="passingYear"
                  value={form.passingYear}
                  onChange={onChange}
                  readOnly={!editMode.administrative}
                />
              </Grid>
            </Section>
          )}

          {/* PHOTO */}
          {activeTab === "photo" && (
            <Section
              title="Profile Photo"
              editing={editMode.photo}
              onEdit={() => toggleEdit("photo")}
            >
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
                {editMode.photo && (
                  <label className="upload-btn">
                    Choose New Photo
                    <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
                  </label>
                )}
              </div>
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
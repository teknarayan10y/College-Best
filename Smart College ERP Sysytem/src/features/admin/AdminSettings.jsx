// src/features/admin/AdminSettings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import "./AdminSettings.css";

const STORAGE_KEYS = {
  avatar: "admin_profile_image",
  prefs: "admin_prefs",
  notif: "admin_notifications",
};

const loadLS = (k, fall = null) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fall; } catch { return fall; }
};
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function AdminSettings() {
  // Tabs
  const [tab, setTab] = useState("profile");

  // Profile
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [avatar, setAvatar] = useState(localStorage.getItem(STORAGE_KEYS.avatar) || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);
  const [twoFA, setTwoFA] = useState(false); // stub toggle

  // Notifications
  const [notif, setNotif] = useState(
    loadLS(STORAGE_KEYS.notif, { emailAnnouncements: true, emailSecurity: true, appReminders: true })
  );
  const [savingNotif, setSavingNotif] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState(
    loadLS(
      STORAGE_KEYS.prefs,
      { theme: "system", language: "en", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    )
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Sessions/Devices
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsErr, setSessionsErr] = useState("");

  // Organization (stubs)
  const [org, setOrg] = useState({ name: "", contactEmail: "", contactPhone: "" });
  const [savingOrg, setSavingOrg] = useState(false);

  // Messages
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Hydrate from server if available
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.adminGetSettings?.();
        if (!mounted || !r) return;
        setProfile(p => ({ ...p, name: r?.profile?.name || p.name, email: r?.profile?.email || p.email }));
        setTwoFA(!!r?.security?.twoFA);
        setNotif(n => ({ ...n, ...(r?.notifications || {}) }));
        setPrefs(p => ({ ...p, ...(r?.preferences || {}) }));
        setOrg(o => ({ ...o, ...(r?.organization || {}) }));
      } catch {
        // ignore: use local defaults
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Hydrate name/email from local storage/auth payload (fallback)
  useEffect(() => {
    if (!profile.name && !profile.email) {
      try {
        const storedAdmin =
          JSON.parse(localStorage.getItem("admin_info") || "null") ||
          JSON.parse(localStorage.getItem("auth_user") || "null") ||
          JSON.parse(localStorage.getItem("user") || "null");
        if (storedAdmin) {
          setProfile(prev => ({
            ...prev,
            name: storedAdmin.name || storedAdmin.fullName || prev.name || "",
            email: storedAdmin.email || prev.email || "",
          }));
        }
      } catch { /* ignore */ }
    }
  }, []); // once

  async function onPickAvatar(e) {
    setErr(""); setMsg("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\//i.test(f.type)) { setErr("Please select an image file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      try {
        localStorage.setItem(STORAGE_KEYS.avatar, dataUrl);
        setAvatar(String(dataUrl));
        setMsg("Profile photo updated.");
        window.dispatchEvent(new Event("storage"));
      } catch { setErr("Failed to store image."); }
    };
    reader.onerror = () => setErr("Failed to read image.");
    reader.readAsDataURL(f);
  }

  async function saveProfile() {
    setErr(""); setMsg(""); setSavingProfile(true);
    try {
      await api.adminUpdateProfile?.({ name: profile.name, email: profile.email });
      setMsg("Profile saved.");
    } catch (e) {
      if (api.adminUpdateProfile) setErr(e.message || "Failed to save profile.");
      else setMsg("Profile saved locally (no backend).");
    } finally { setSavingProfile(false); }
  }

  async function changePassword() {
    setErr(""); setMsg(""); setSavingPwd(true);
    try {
      if (!pwd.current || !pwd.next || !pwd.confirm) throw new Error("Fill all password fields.");
      if (pwd.next !== pwd.confirm) throw new Error("New passwords do not match.");
      await api.adminChangePassword?.({ currentPassword: pwd.current, newPassword: pwd.next });
      setMsg("Password changed.");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (e) {
      if (api.adminChangePassword) setErr(e.message || "Failed to change password.");
      else setMsg("Password change simulated (no backend).");
    } finally { setSavingPwd(false); }
  }

  async function saveNotifications() {
    setErr(""); setMsg(""); setSavingNotif(true);
    try {
      if (api.adminSaveSettings) await api.adminSaveSettings({ notifications: notif });
      else saveLS(STORAGE_KEYS.notif, notif);
      setMsg("Notifications saved.");
    } catch (e) {
      setErr(e.message || "Failed to save notifications.");
    } finally { setSavingNotif(false); }
  }

  async function savePreferences() {
    setErr(""); setMsg(""); setSavingPrefs(true);
    try {
      if (api.adminSaveSettings) await api.adminSaveSettings({ preferences: prefs });
      saveLS(STORAGE_KEYS.prefs, prefs);
      setMsg("Preferences saved.");
    } catch (e) {
      setErr(e.message || "Failed to save preferences.");
    } finally { setSavingPrefs(false); }
  }

  async function loadSessions() {
    setSessionsErr(""); setLoadingSessions(true);
    try {
      const r = await api.adminListSessions?.();
      setSessions(Array.isArray(r?.items) ? r.items : []);
      if (!r) setSessions([]); // not wired
    } catch (e) {
      setSessionsErr(e.message || "Failed to load sessions.");
      setSessions([]);
    } finally { setLoadingSessions(false); }
  }

  async function revokeSession(id) {
    try {
      await api.adminRevokeSession?.(id);
      setSessions(s => s.filter(x => x._id !== id && x.id !== id));
    } catch (e) { setErr(e.message || "Failed to revoke session"); }
  }

  const initial = useMemo(() => {
    const n = String(profile.name || "").trim();
    if (n) return n[0]?.toUpperCase() || "";
    const em = String(profile.email || "").trim();
    return em ? em[0]?.toUpperCase() : "A";
  }, [profile]);

  return (
    <div className="card wide" style={{ padding: 16 }}>
      <div className="au-header" style={{ marginBottom: 12 }}>
        <h2>Admin Settings</h2>
        <div className="au-actions" style={{ gap: 8 }}>
          <button className={`btn ${tab==='profile'?'btn-primary':''}`} onClick={()=>setTab('profile')}>Profile</button>
          <button className={`btn ${tab==='security'?'btn-primary':''}`} onClick={()=>setTab('security')}>Security</button>
          <button className={`btn ${tab==='notifications'?'btn-primary':''}`} onClick={()=>setTab('notifications')}>Notifications</button>
          <button className={`btn ${tab==='preferences'?'btn-primary':''}`} onClick={()=>setTab('preferences')}>Preferences</button>
          <button className={`btn ${tab==='sessions'?'btn-primary':''}`} onClick={()=>setTab('sessions')}>Sessions</button>
          <button className={`btn ${tab==='organization'?'btn-primary':''}`} onClick={()=>setTab('organization')}>Organization</button>
        </div>
      </div>

      {err && <div className="alert error" style={{ marginBottom: 8 }}>{err}</div>}
      {msg && <div className="alert" style={{ marginBottom: 8 }}>{msg}</div>}

      {tab === 'profile' && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div className="avatar large" style={{ width: 84, height: 84, borderRadius: "50%", overflow: "hidden", background: "#eee", display: "grid", placeItems: "center", fontSize: 28 }}>
              {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
            </div>
            <label className="btn">
              Change Photo
              <input type="file" accept="image/*" onChange={onPickAvatar} style={{ display: "none" }} />
            </label>

            {/* Read-only display of current name + email */}
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{profile.name || '—'}</div>
              <div style={{ color: '#9aa4b2' }}>{profile.email || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <label>Name <input className="fd-input full" value={profile.name} onChange={e=>setProfile(p=>({...p, name: e.target.value}))} /></label>
            <label>Email <input className="fd-input full" value={profile.email} onChange={e=>setProfile(p=>({...p, email: e.target.value}))} /></label>
            <button className="btn" onClick={saveProfile} disabled={savingProfile}>{savingProfile?'Saving…':'Save Profile'}</button>
          </div>
        </section>
      )}

      {tab === 'security' && (
        <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={twoFA} onChange={e=>setTwoFA(e.target.checked)} />
            <span>Enable Two-Factor Authentication (stub)</span>
          </div>
          <h4>Change Password</h4>
          <input className="fd-input full" type="password" placeholder="Current password" value={pwd.current} onChange={e=>setPwd(p=>({...p, current: e.target.value}))} />
          <input className="fd-input full" type="password" placeholder="New password" value={pwd.next} onChange={e=>setPwd(p=>({...p, next: e.target.value}))} />
          <input className="fd-input full" type="password" placeholder="Confirm new password" value={pwd.confirm} onChange={e=>setPwd(p=>({...p, confirm: e.target.value}))} />
          <button className="btn" onClick={changePassword} disabled={savingPwd}>{savingPwd?'Saving…':'Change Password'}</button>
        </section>
      )}

      {tab === 'notifications' && (
        <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label><input type="checkbox" checked={notif.emailAnnouncements} onChange={e=>setNotif(n=>({...n, emailAnnouncements: e.target.checked}))} /> Email announcements</label>
          <label><input type="checkbox" checked={notif.emailSecurity} onChange={e=>setNotif(n=>({...n, emailSecurity: e.target.checked}))} /> Security alerts via email</label>
          <label><input type="checkbox" checked={notif.appReminders} onChange={e=>setNotif(n=>({...n, appReminders: e.target.checked}))} /> In-app reminders</label>
          <button className="btn" onClick={saveNotifications} disabled={savingNotif}>{savingNotif?'Saving…':'Save Notifications'}</button>
        </section>
      )}

      {tab === 'preferences' && (
        <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label>Theme
            <select className="fd-input full" value={prefs.theme} onChange={e=>setPrefs(p=>({...p, theme: e.target.value}))}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>Language
            <select className="fd-input full" value={prefs.language} onChange={e=>setPrefs(p=>({...p, language: e.target.value}))}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <label>Timezone
            <input className="fd-input full" value={prefs.timezone} onChange={e=>setPrefs(p=>({...p, timezone: e.target.value}))} />
          </label>
          <button className="btn" onClick={savePreferences} disabled={savingPrefs}>{savingPrefs?'Saving…':'Save Preferences'}</button>
        </section>
      )}

      {tab === 'sessions' && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div>
            <button className="btn" onClick={loadSessions} disabled={loadingSessions}>
              {loadingSessions ? 'Loading…' : 'Load Sessions'}
            </button>
          </div>
          {sessionsErr && <div className="alert error">{sessionsErr}</div>}
          {sessions.length === 0 && !loadingSessions && <div className="empty-hint">No active sessions.</div>}
          {sessions.length > 0 && (
            <div className="table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Device</th><th>IP</th><th>Last Active</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s._id || s.id}>
                      <td>{s.device || s.ua || '-'}</td>
                      <td>{s.ip || '-'}</td>
                      <td>{s.lastActive ? new Date(s.lastActive).toLocaleString() : '-'}</td>
                      <td><button className="btn" onClick={()=>revokeSession(s._id || s.id)}>Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'organization' && (
        <section style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
          <label>Organization Name
            <input className="fd-input full" value={org.name} onChange={e=>setOrg(o=>({...o, name: e.target.value}))} />
          </label>
          <label>Contact Email
            <input className="fd-input full" value={org.contactEmail} onChange={e=>setOrg(o=>({...o, contactEmail: e.target.value}))} />
          </label>
          <label>Contact Phone
            <input className="fd-input full" value={org.contactPhone} onChange={e=>setOrg(o=>({...o, contactPhone: e.target.value}))} />
          </label>
          <div><button className="btn" onClick={async ()=>{
            setSavingOrg(true); setErr(""); setMsg("");
            try {
              if (api.adminSaveSettings) await api.adminSaveSettings({ organization: org });
              setMsg("Organization saved.");
            } catch(e){ setErr(e.message || "Failed to save organization."); }
            finally{ setSavingOrg(false); }
          }} disabled={savingOrg}>{savingOrg?'Saving…':'Save Organization'}</button></div>
        </section>
      )}
    </div>
  );
}
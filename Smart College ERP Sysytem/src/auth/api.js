// src/auth/api.js
import { getToken, clearToken, clearUser } from './storage';
const BASE = import.meta.env.VITE_API_BASE_URL;

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isForm) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    // Handle 401 Unauthorized for authenticated endpoints - do not redirect on login/face-login attempts
    if (res.status === 401 && !path.includes('login') && !path.includes('signup') && !path.includes('face-login')) {
      clearToken();
      clearUser();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    throw err;
  }
  return data;
}
function toQS(params) {
  if (!params) return '';
  const esc = encodeURIComponent;
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}
// New: for multipart/form-data (do not set Content-Type yourself)
async function requestForm(path, formData, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { method: 'PUT', headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    // Handle 401 Unauthorized for authenticated endpoints - do not redirect on login/face-login attempts
    if (res.status === 401 && !path.includes('login') && !path.includes('signup') && !path.includes('face-login')) {
      clearToken();
      clearUser();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    throw err;
  }
  return data;
}

export const api = {
  signup:     (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login:      (body) => request('/auth/login',  { method: 'POST', body: JSON.stringify(body) }),
  me:         ()    => {
    const token = getToken();
    if (!token) return Promise.reject(new Error('No token found'));
    return request('/auth/refresh', { method: 'POST' });
  },

  studentData: ()   => request('/dashboard/student-data'),
  facultyData: ()   => request('/dashboard/faculty-data'),
  digitalTwin: ()   => request('/dashboard/digital-twin'),

  profileGet:    ()   => request('/profile', { method: 'GET' }),
  profilePut:    (b)  => request('/profile', { method: 'PUT', body: JSON.stringify(b) }),
  profilePutForm: (fd) => requestForm('/profile', fd),

  // Admin Students
  adminStudents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/students${qs ? `?${qs}` : ""}`, { method: 'GET' });
  },
  adminStudentProfile: (userId) =>
    request(`/admin/students/${userId}/profile`, { method: 'GET' }),
  adminUpdateStudentProfile: (userId, body) =>
    request(`/admin/students/${userId}/profile`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminUpdateStudentStatus: (userId, isActive) =>
    request(`/admin/students/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),

  // Faculty (self)
  facultyProfileGet: () => request('/faculty-profile', { method: 'GET' }),
  facultyProfilePut: (b) => request('/faculty-profile', { method: 'PUT', body: JSON.stringify(b) }),
  facultyProfilePutForm: (fd) => requestForm('/faculty-profile', fd),
  facultyMyCourses: () => request('/faculty/courses', { method: 'GET' }),

  //Faculty Attendance
 facultyAttendanceList: (params) =>
  request(`/faculty/attendance${toQS(params)}`, { method: 'GET' }),

facultyCourses: () =>
  request('/faculty/attendance/courses', { method: 'GET' }),

// Replace the current facultyCourseStudents with this:
facultyCourseStudents: (arg) => {
  const params = (typeof arg === 'string') ? { courseId: arg } : (arg || {});
  return request(`/faculty/attendance/students${toQS(params)}`, { method: 'GET' });
},

facultyMarkStudentSession: (payload) =>
  request('/faculty/attendance/mark-student-session', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

facultyBulkDay: (payload) =>
  request('/faculty/attendance/bulk-day', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),


  // faculty assignment APIs
// faculty assignment APIs
facultyAssignmentsList: () =>
  request('/faculty/assignments', { method: 'GET' }),



facultyAssignmentsCreate: (payload = {}, files = []) => {
  const fd = new FormData();
  // Expected keys: title (string), courseId (string), description (optional), dueDate (optional)
  if (payload.title) fd.append('title', String(payload.title));
  if (payload.courseId) fd.append('courseId', String(payload.courseId));
  if (payload.description) fd.append('description', String(payload.description));
  if (payload.dueDate) fd.append('dueDate', String(payload.dueDate)); // yyyy-mm-dd or ISO

  (files || []).forEach(f => {
    if (f) fd.append('files', f);
  });

  // IMPORTANT: do not set Content-Type; the request() helper should pass FormData directly
  return request('/faculty/assignments', {
    method: 'POST',
    body: fd
  });
},

// Faculty: list submissions for an assignment
facultyAssignmentSubmissions: (assignmentId) =>
  request(
    `/faculty/assignments/${encodeURIComponent(assignmentId)}/submissions`,
    { method: 'GET' }
  ),



  //faculty dashboard functions
  facultyAnalyticsToday: (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/faculty/analytics/today${qs ? `?${qs}` : ''}`, { method: 'GET' });
},
facultyAnalyticsSubjectSummary: (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/faculty/analytics/subject-summary${qs ? `?${qs}` : ''}`, { method: 'GET' });
},
facultyAnalyticsRecent: (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/faculty/analytics/recent${qs ? `?${qs}` : ''}`, { method: 'GET' });
},


  // Faculty attendance: fetch day status per student
facultyDayStatus: (params) =>
  request(`/faculty/attendance/day-status${toQS(params)}`, { method: 'GET' }),

// Faculty: list submissions for an assignment
// Faculty marks management
facultyMarksGet: (courseId) =>
  request(`/faculty/marks/${encodeURIComponent(courseId)}`, { method: 'GET' }),

facultyMarksSave: (payload) =>
  request('/faculty/marks', { method: 'POST', body: JSON.stringify(payload) }),

facultyDeleteMarks: (courseId, studentId) =>
  request(`/faculty/marks/${encodeURIComponent(courseId)}/${encodeURIComponent(studentId)}`, { method: 'DELETE' }),

  // Admin Faculty
  adminCreateFaculty: (body) =>
    request('/admin/faculty', { method: 'POST', body: JSON.stringify(body) }),
  adminFaculty: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/faculty${qs ? `?${qs}` : ""}`, { method: 'GET' });
  },
  adminFacultyProfile: (userId) =>
    request(`/admin/faculty/${userId}/profile`, { method: 'GET' }),
  adminUpdateFacultyProfile: (userId, body) =>
    request(`/admin/faculty/${userId}/profile`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminUpdateFacultyStatus: (userId, isActive) =>
    request(`/admin/faculty/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),

  // Admin Courses
  adminCourses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/courses${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
  adminCreateCourse: (body) =>
    request('/admin/courses', { method: 'POST', body: JSON.stringify(body) }),
  adminCourseById: (id) => request(`/admin/courses/${id}`, { method: 'GET' }),
  adminUpdateCourse: (id, body) =>
    request(`/admin/courses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminDeleteCourse: (id) =>
    request(`/admin/courses/${id}`, { method: 'DELETE' }),

  // Admin Departments
  adminDepartments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/departments${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
  adminCreateDepartment: (body) =>
    request('/admin/departments', { method: 'POST', body: JSON.stringify(body) }),
  adminDepartmentById: (id) =>
    request(`/admin/departments/${id}`, { method: 'GET' }),
  adminUpdateDepartment: (id, body) =>
    request(`/admin/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminDeleteDepartment: (id) =>
    request(`/admin/departments/${id}`, { method: 'DELETE' }),

// Admin Attendance
    adminAttendanceList: (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/attendance${qs ? `?${qs}` : ''}`, { method: 'GET' });
},
adminAttendanceMarkSession: (body) =>
  request('/admin/attendance/mark-session', { method: 'POST', body: JSON.stringify(body) }),
adminAttendanceBulkDay: (body) =>
  request('/admin/attendance/bulk-day', { method: 'POST', body: JSON.stringify(body) }),
adminAttendanceSummary: (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/attendance/summary${qs ? `?${qs}` : ''}`, { method: 'GET' });
},
//student attendance
 studentCourses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/student-courses${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
  // Student attendance read-only
  studentAttendanceList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/student/attendance${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  // Student exam marks (read-only)
  studentMarks: () => request('/student/marks', { method: 'GET' }),

  // Student assignments
studentAssignments: (params = {}) => {
  return request(`/student/assignments${toQS(params)}`, { method: 'GET' });
},

// Submit an assignment (multipart). body: { note? }, files: File[]
studentSubmitAssignment: (assignmentId, payload = {}, files = []) => {
  const fd = new FormData();
  if (payload.note) fd.append('note', String(payload.note));
  (files || []).forEach(f => { if (f) fd.append('files', f); });
  // do not set Content-Type
  return request(`/student/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
    method: 'POST',
    body: fd
  });
},

// Admin settings API (implement server routes to persist)
adminGetSettings: () => request('/admin/settings', { method: 'GET' }),
adminSaveSettings: (body) =>
  request('/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),

adminUpdateProfile: (body) =>
  request('/admin/profile', { method: 'PUT', body: JSON.stringify(body) }),
adminChangePassword: (body) =>
  request('/admin/change-password', { method: 'POST', body: JSON.stringify(body) }),

// Sessions
adminListSessions: () => request('/admin/sessions', { method: 'GET' }),
adminRevokeSession: (sessionId) =>
  request(`/admin/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

// Get my submission for an assignment
studentMySubmission: (assignmentId) =>
  request(`/student/assignments/${encodeURIComponent(assignmentId)}/submissions/me`, { method: 'GET' }),

// Student AI Assistant — supports optional file attachment (ChatGPT-style)
studentAiChat: (message, file) => {
  if (file) {
    const fd = new FormData();
    fd.append('message', message);
    fd.append('file', file);
    return request('/student/ai/chat', { method: 'POST', body: fd });
  }
  return request('/student/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
},

// Faculty AI Assistant — supports optional file attachment
facultyAiChat: (message, file) => {
  if (file) {
    const fd = new FormData();
    fd.append('message', message);
    fd.append('file', file);
    return request('/faculty/ai/chat', { method: 'POST', body: fd });
  }
  return request('/faculty/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
},

// Admin AI Assistant — supports optional file attachment
adminAiChat: (message, file) => {
  if (file) {
    const fd = new FormData();
    fd.append('message', message);
    fd.append('file', file);
    return request('/admin/ai/chat', { method: 'POST', body: fd });
  }
  return request('/admin/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
},

// SnapClass AI Biometric & Attendance Suite
faceLogin: (image, email) =>
  request('/auth/face-login', { method: 'POST', body: JSON.stringify({ image, email }) }),

enrollBiometrics: (data) =>
  request('/profile/biometrics', { method: 'POST', body: JSON.stringify(data) }),

facultyAiScanPhoto: (courseId, image, threshold = 0.60) =>
  request('/faculty/attendance/ai-scan-photo', { method: 'POST', body: JSON.stringify({ courseId, image, threshold }) }),

facultyAiScanVoice: (courseId, audio, threshold = 0.55) =>
  request('/faculty/attendance/ai-scan-voice', { method: 'POST', body: JSON.stringify({ courseId, audio, threshold }) }),

adminAiScanPhoto: (payload) =>
  request('/admin/attendance/ai-scan-photo', { method: 'POST', body: JSON.stringify(payload) }),

adminAiScanVoice: (payload) =>
  request('/admin/attendance/ai-scan-voice', { method: 'POST', body: JSON.stringify(payload) }),

// Notifications
getNotifications: (limit = 20) =>
  request(`/notifications?limit=${limit}`),

markNotificationRead: (id) =>
  request(`/notifications/${id}/read`, { method: 'PATCH' }),

markAllNotificationsRead: () =>
  request('/notifications/read-all', { method: 'PATCH' }),

deleteNotification: (id) =>
  request(`/notifications/${id}`, { method: 'DELETE' }),

clearAllNotifications: () =>
  request('/notifications/clear-all', { method: 'DELETE' }),

// Attendance 75% Predictive Analytics & Trends
studentAttendanceTrends: () =>
  request('/student/attendance/trends'),

// Multi-Factor Academic Risk Analysis
studentAcademicRisk: () =>
  request('/academic-risk/student'),

facultyCourseAcademicRisk: (courseId) =>
  request(`/academic-risk/faculty/${courseId}`)
};


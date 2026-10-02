const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');

const connectDB = require('./.config/db');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminStudentRoutes = require('./routes/adminStudentRoutes');
const facultyProfileRoutes = require('./routes/facultyProfileRoutes');
const adminFacultyRoutes = require('./routes/adminFacultyRoutes');
const adminCourseRoutes = require('./routes/adminCourseRoutes');
const facultyCourseRoutes = require('./routes/facultyCourseRoutes');
const adminDepartmentRoutes = require('./routes/adminDepartmentRoutes');
const adminAttendanceRoutes = require('./routes/adminAttendanceRoutes');
const facultyAttendanceRoutes = require('./routes/facultyAttendanceRoutes');
const studentAttendanceRoutes = require('./routes/studentAttendanceRoutes');
const facultyAnalyticsRoutes = require('./routes/facultyAnalyticsRoutes');
const facultyAssignmentRoutes = require('./routes/assignmentRoutes');
const facultySubmissionRoutes = require('./routes/facultySubmissionRoutes');
const facultyMarksRoutes = require('./routes/facultyMarksRoutes');
const studentAssignmentRoutes = require('./routes/studentAssignmentRoutes');
const studentSubmissionRoutes = require('./routes/studentSubmissionRoutes');
const studentAiRoutes = require('./routes/studentAiRoutes');
const facultyAiRoutes = require('./routes/facultyAiRoutes');
const adminAiRoutes = require('./routes/adminAiRoutes');


const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');

dotenv.config();

const app = express();

// connect DB (your file likely already does this)
connectDB();

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));


// Middleware
app.use(cors());
app.use('/api/faculty/assignments', facultySubmissionRoutes);
app.use('/api/faculty/assignments', facultyAssignmentRoutes);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const { seedKnowledgeBase } = require('./services/ragService');

// ONE-TIME INDEX FIX/SYNC & RAG SEEDING ON START
mongoose.connection.once('open', async () => {
  try {
    await Attendance.collection.dropIndex('course_1_date_1').catch(() => {});
    await Attendance.syncIndexes();
    console.log('[Attendance] indexes synced');
  } catch (e) {
    console.error('[Attendance] index sync error:', e && e.message ? e.message : e);
  }

  // Seed Knowledge Base for Vector RAG
  try {
    await seedKnowledgeBase();
  } catch (e) {
    console.error('[RAG] seed error:', e && e.message ? e.message : e);
  }
});

// Routes (as you already have)
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/user', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/students', adminStudentRoutes);
app.use('/api/faculty-profile', facultyProfileRoutes);
app.use('/api/admin/faculty', adminFacultyRoutes);
app.use('/api/admin/courses', adminCourseRoutes);
app.use('/api/faculty', facultyCourseRoutes);
app.use('/api/faculty/attendance', facultyAttendanceRoutes);
app.use('/api/faculty', facultyMarksRoutes);
app.use('/api/admin/departments', adminDepartmentRoutes);
app.use('/api/admin/attendance', adminAttendanceRoutes);
app.use('/api/student/attendance', studentAttendanceRoutes);
app.use('/api/student/assignments', studentAssignmentRoutes);
app.use('/api/student/assignments', studentSubmissionRoutes);
app.use('/api/student/ai', studentAiRoutes);
app.use('/api/faculty/ai', facultyAiRoutes);
app.use('/api/admin/ai', adminAiRoutes);


app.use('/api/faculty/analytics', facultyAnalyticsRoutes);
// static serving (public)
app.use('/uploads', require('express').static(path.join(__dirname, 'uploads')));

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File too large.' });
  }
  if (err && err.code === 'LIMIT_FIELD_SIZE') {
    return res.status(413).json({ message: 'Text field too large.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request entity too large.' });
  }
  next(err);
});
// Start server (your existing listen)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
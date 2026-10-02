const bcrypt = require('bcryptjs');
const User = require('../models/User');
const FacultyProfile = require('../models/FacultyProfile');

async function createFaculty(req, res) {
  const { name, email, password, department, designation, facultyId, phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ message: 'name and email are required' });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ message: 'Email already in use' });

  const pwd = password && password.trim().length >= 6 ? password.trim() : Math.random().toString(36).slice(-10);
  const hash = await bcrypt.hash(pwd, 10);

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hash,
    role: 'faculty',
    isActive: true,
  });

  const profile = await FacultyProfile.create({
    user: user._id,
    email: user.email,
    department: department || '',
    designation: designation || '',
    facultyId: facultyId || '',
    phone: phone || '',
  });

  return res.status(201).json({ user: user.toJSON(), profile, tempPassword: password ? undefined : pwd });
}
async function listFaculty(req, res) {
  const users = await User.find({ role: 'faculty' }, { name: 1, email: 1, isActive: 1 })
    .sort({ name: 1 })
    .lean();
  const ids = users.map(u => u._id);
  const profs = await FacultyProfile.find({ user: { $in: ids } }, {
    user: 1, department: 1, designation: 1, facultyId: 1, profileImage: 1
  }).lean();
  const map = new Map(profs.map(p => [String(p.user), p]));
  const rows = users.map(u => {
    const p = map.get(String(u._id)) || {};
    return {
      userId: u._id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      department: p.department || '',
      designation: p.designation || '',
      facultyId: p.facultyId || '',
      profileImage: p.profileImage || ''
    };
  });
  return res.json({ faculty: rows });
}
async function getFacultyProfile(req, res) {
  const userId = req.params.userId;
  const user = await User.findById(userId, { name: 1, email: 1, role: 1, isActive: 1 }).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.role !== 'faculty') return res.status(400).json({ message: 'Not a faculty' });
  const profile = await FacultyProfile.findOne({ user: userId }).lean();
  return res.json({ user, profile });
}
async function updateFacultyProfile(req, res) {
  const userId = req.params.userId;

  const allowed = [
    'firstName','lastName','gender','dob',
    'email','phone','altPhone','address','city','state','pincode',
    'facultyId','department','designation','teachingSubjects', 
    'qualification','experienceYears','experienceSummary','employmentStatus',
    'github','linkedin','portfolio','remarks',
  ];
  const updates = {};
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(req.body, k)) updates[k] = req.body[k];

  if (updates.experienceYears !== undefined) {
    const n = Number(updates.experienceYears);
    updates.experienceYears = Number.isFinite(n) ? n : 0;
  }
  if (updates.employmentStatus !== undefined) {
    const ok = new Set(['active','on_leave','resigned']);
    if (!ok.has(String(updates.employmentStatus))) {
      return res.status(400).json({ message: 'Invalid employmentStatus' });
    }
  }

  const profile = await FacultyProfile.findOneAndUpdate(
    { user: userId },
    { $set: updates },
    { new: true, upsert: true }
  ).lean();

  return res.json({ profile });
}

async function updateUserStatus(req, res) {
  const userId = req.params.userId;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be boolean' });
  const user = await User.findByIdAndUpdate(
    userId, { isActive }, { new: true, fields: { name:1, email:1, role:1, isActive:1 } }
  ).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ user });
}

module.exports = { createFaculty, listFaculty, getFacultyProfile, updateFacultyProfile, updateUserStatus };
const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  semester: { type: Number, default: 1 },
  section: { type: String, default: '' }, // A, B, C (optional)
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // <= ref to User
  description: { type: String, default: '' },
  joinCode: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Course', CourseSchema);
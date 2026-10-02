const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  originalName: String,
  mimeType: String,
  size: Number,
  path: String,
  url: String,
}, { _id: false });

const AssignmentSchema = new mongoose.Schema({
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  dueDate: { type: Date },
  files: [FileSchema],
}, { timestamps: true });

module.exports = mongoose.model('Assignment', AssignmentSchema);
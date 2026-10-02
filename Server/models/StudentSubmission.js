const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  originalName: String,
  mimeType: String,
  size: Number,
  path: String,
  url: String,
}, { _id: false });

const StudentSubmissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, default: '' },
  files: [FileSchema],
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

StudentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('StudentSubmission', StudentSubmissionSchema);
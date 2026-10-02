const mongoose = require('mongoose');

const facultyProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, unique: true, required: true },

    // Personal
    firstName: String,
    lastName: String,
    gender: String,
    dob: String,

    // Contact
    email: String,
    phone: String,
    altPhone: String,
    address: String,
    city: String,
    state: String,
    pincode: String,

    // Faculty details
    facultyId: String,
    department: String,
    designation: String,
   // inside FacultyProfile schema definition
teachingSubjects: { type: [String], default: [] },

    qualification: String,           // e.g., Ph.D., M.Tech, etc.
experienceYears: Number,         // total years of experience
experienceSummary: String,       // brief experience summary
employmentStatus: {
  type: String,
  enum: ['active', 'on_leave', 'resigned'],
  default: 'active'
},
    // Professional
    profileImage: String,
    github: String,
    linkedin: String,
    portfolio: String,

    // Other
    remarks: String,

    // Biometrics (SnapClass AI)
    faceEmbedding: { type: [Number], default: [] },
    faceDescriptor: { type: [Number], default: [] }, // 128-dim neural descriptor from face-api.js
    voiceEmbedding: { type: [Number], default: [] },
    biometricRegistered: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FacultyProfile', facultyProfileSchema);
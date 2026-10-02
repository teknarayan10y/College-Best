const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, unique: true, required: true },

    // Personal
    firstName: String,
    lastName: String,
    gender: String,
    dob: String,
    bloodGroup: String,
    nationality: String,

    // Contact
    email: String,
    phone: String,
    altPhone: String,
    address: String,
    city: String,
    state: String,
    pincode: String,

   // Academic
registerNumber: String,
rollNo: String,
program: String,
branch: String,
semester: String,
// in Server/models/StudentProfile.js
studentId: { type: String, index: true, unique: true, sparse: true },
year: String,        // <— add this line
section: String,
admissionYear: String,
passoutYear: String,
cgpa: String,
    // Professional
    profileImage: String,          // store URL/path if you add uploads later
    github: String,
    linkedin: String,
    portfolio: String,
    leetcode: String,
    hackerrank: String,
    codechef: String,
    codeforces: String,
    kaggle: String,
    resumeLink: String,

    // Other
    aadhaar: String,
    hobbies: String,
    achievements: String,
    remarks: String,

    // AI Biometrics (SnapClass Engine)
    faceEmbedding: { type: [Number], default: [] },
    voiceEmbedding: { type: [Number], default: [] },
    biometricRegistered: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
const mongoose = require('mongoose');

const MarksSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  semesterExam: {
    type: Number,
    min: 0,
    max: 60,
    default: 0
  },
  assignment: {
    type: Number,
    min: 0,
    max: 20,
    default: 0
  },
  practical: {
    type: Number,
    min: 0,
    max: 20,
    default: 0
  },
  total: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  grade: {
    type: String,
    enum: ['O', 'A+', 'A', 'B+', 'B', 'C', 'F'],
    default: 'F'
  },
  semester: {
    type: Number,
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for unique marks per student per course
MarksSchema.index({ courseId: 1, studentId: 1, facultyId: 1 }, { unique: true });

// Method to calculate total and grade
MarksSchema.methods.calculateTotalAndGrade = function() {
  this.total = Math.min(100, (this.semesterExam || 0) + (this.assignment || 0) + (this.practical || 0));
  
  if (this.total >= 95) this.grade = 'O';
  else if (this.total >= 90) this.grade = 'A+';
  else if (this.total >= 80) this.grade = 'A';
  else if (this.total >= 70) this.grade = 'B+';
  else if (this.total >= 60) this.grade = 'B';
  else if (this.total >= 50) this.grade = 'C';
  else this.grade = 'F';
  
  return this.total;
};

module.exports = mongoose.model('Marks', MarksSchema);
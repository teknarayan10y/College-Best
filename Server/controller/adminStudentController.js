// Server/controller/adminStudentController.js
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");

/**
 * GET /api/admin/students
 */
async function listStudents(req, res) {
  try {
    const users = await User.find({ role: "student" }, { firstName:1,lastName:1,email:1,role:1,isActive:1 }).lean();
    const userIds = users.map(u => u._id);
    const profiles = await StudentProfile.find({ user: { $in: userIds } }).lean();
    const byUser = new Map(profiles.map(p => [String(p.user), p]));
    const items = users.map(u => ({ user: u, profile: byUser.get(String(u._id)) || null }));
    res.json({ items });
  } catch (e) {
    console.error("listStudents error:", e);
    res.status(500).json({ message: "Failed to list students" });
  }
}

/**
 * GET /api/admin/students/:userId/profile
 */
async function getStudentProfile(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId, { firstName:1,lastName:1,email:1,role:1,isActive:1 }).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    let profile = await StudentProfile.findOne({ user: userId }).lean();
    if (!profile) {
      profile = await StudentProfile.create({ user: userId });
      profile = profile.toObject();
    }
    res.json({ user, profile });
  } catch (e) {
    console.error("getStudentProfile error:", e);
    res.status(500).json({ message: "Failed to get student profile" });
  }
}

/**
 * PATCH /api/admin/students/:userId/profile
 */
async function updateStudentProfile(req, res) {
  try {
    const { userId } = req.params;

    const allowed = [
      // Personal
      'firstName','lastName','gender','dob',
      // Contact
      'email','phone','altPhone','address','city','state','pincode',
      // Academic
      'studentId','branch','semester', 'section','year','cgpa','skills','projects',
      // Links/Other
      'github','linkedin','portfolio','resumeLink','remarks',
      // Optionally: 'profileImage' (if you want to clear path)
    ];

    const update = {};
    for (const k of allowed) if (Object.prototype.hasOwnProperty.call(req.body, k)) update[k] = req.body[k];

    // Normalize types
    if (update.cgpa !== undefined) {
      const n = Number(update.cgpa);
      update.cgpa = Number.isFinite(n) ? n : 0;
    }
    if (update.skills !== undefined) {
      let skills = update.skills;
      if (typeof skills === "string") {
        try {
          const parsed = JSON.parse(skills);
          skills = Array.isArray(parsed) ? parsed : String(skills).split(",").map(s=>s.trim()).filter(Boolean);
        } catch {
          skills = String(skills).split(",").map(s=>s.trim()).filter(Boolean);
        }
      }
      if (!Array.isArray(skills)) skills = [];
      update.skills = skills;
    }

    // Ensure profile exists
    let profile = await StudentProfile.findOne({ user: userId });
    if (!profile) profile = new StudentProfile({ user: userId });

    Object.assign(profile, update);
    await profile.save();

    // Optionally sync name/email on user
    // after Object.assign(profile, update) and before saving user:
const userUpdate = {};
if (update.firstName !== undefined || update.lastName !== undefined) {
  const fn = update.firstName ?? profile.firstName ?? '';
  const ln = update.lastName ?? profile.lastName ?? '';
  const full = `${fn} ${ln}`.trim();
  if (full) userUpdate.name = full;       // <-- set User.name
}
if (update.email !== undefined) userUpdate.email = update.email;

    let user = null;
    if (Object.keys(userUpdate).length) {
      user = await User.findByIdAndUpdate(
        userId,
        userUpdate,
        { new: true, fields: { firstName:1,lastName:1,email:1,role:1,isActive:1 } }
      ).lean();
    } else {
      user = await User.findById(userId, { firstName:1,lastName:1,email:1,role:1,isActive:1 }).lean();
    }

    res.json({ user, profile: profile.toObject() });
  } catch (e) {
    console.error("updateStudentProfile error:", e);
    res.status(500).json({ message: "Failed to update student profile" });
  }
}

/**
 * PATCH /api/admin/students/:userId/status
 * body: { isActive: boolean }
 */
async function updateUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be boolean' });

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true, fields: { firstName:1,lastName:1,email:1,role:1,isActive:1 } }
    ).lean();

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (e) {
    console.error("updateUserStatus (student) error:", e);
    res.status(500).json({ message: "Failed to update user status" });
  }
}

module.exports = {
  listStudents,
  getStudentProfile,
  updateStudentProfile,
  updateUserStatus,
};
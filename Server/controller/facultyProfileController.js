const FacultyProfile = require('../models/FacultyProfile');
const User = require('../models/User');

function splitName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

async function getProfile(req, res) {
  try {
    const rawId = req.user.id || req.user._id || req.user.sub;
    const user = await User.findById(rawId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { firstName: userFirstName, lastName: userLastName } = splitName(user.name);
    let profile = await FacultyProfile.findOne({ user: rawId });

    if (!profile) {
      profile = await FacultyProfile.create({
        user: rawId,
        email: user.email || req.user.email || '',
        firstName: userFirstName,
        lastName: userLastName,
      });
    } else {
      let changed = false;
      if (!profile.email && user.email) {
        profile.email = user.email;
        changed = true;
      }
      if (!profile.firstName && !profile.lastName && user.name) {
        profile.firstName = userFirstName;
        profile.lastName = userLastName;
        changed = true;
      }
      if (changed) {
        await profile.save();
      }
    }

    const profileObj = profile.toObject ? profile.toObject() : profile;
    return res.json({
      profile: {
        ...profileObj,
        firstName: profileObj.firstName || userFirstName,
        lastName: profileObj.lastName || userLastName,
        email: profileObj.email || user.email || '',
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        firstName: userFirstName,
        lastName: userLastName,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to fetch faculty profile' });
  }
}

async function updateProfile(req, res) {
  try {
    const rawId = req.user.id || req.user._id || req.user.sub;
    const userId = rawId;

    // Whitelist of allowed fields
    const allowed = [
      // Personal
      'firstName','lastName','gender','dob',
      // Contact
      'email','phone','altPhone','address','city','state','pincode',
      // Faculty
      'facultyId','department','designation','teachingSubjects',
      // Career
      'qualification','experienceYears','experienceSummary','employmentStatus',
      // Social/Other
      'github','linkedin','portfolio','remarks',
    ];

    const updates = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        updates[k] = req.body[k];
      }
    }

    // Coerce teachingSubjects if passed as string JSON
    if (typeof updates.teachingSubjects === 'string') {
      try {
        updates.teachingSubjects = JSON.parse(updates.teachingSubjects);
      } catch {
        updates.teachingSubjects = updates.teachingSubjects.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Coerce types / validate
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

    // Image upload
    if (req.file) {
      updates.profileImage = `/uploads/${req.file.filename}`;
    }

    const profile = await FacultyProfile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, upsert: true }
    );

    // If firstName/lastName updated, keep User.name updated in DB
    let user = await User.findById(userId);
    if (user) {
      if (updates.firstName || updates.lastName) {
        const fn = updates.firstName !== undefined ? updates.firstName : (profile.firstName || '');
        const ln = updates.lastName !== undefined ? updates.lastName : (profile.lastName || '');
        const fullName = `${fn} ${ln}`.trim();
        if (fullName) {
          user.name = fullName;
          await user.save();
        }
      }
    }

    const { firstName: userFirstName, lastName: userLastName } = splitName(user ? user.name : '');

    return res.json({
      profile,
      user: user ? {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        firstName: userFirstName,
        lastName: userLastName,
      } : undefined,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Update failed' });
  }
}

module.exports = { getProfile, updateProfile };
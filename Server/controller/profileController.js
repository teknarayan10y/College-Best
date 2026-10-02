const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const { extractFaceEmbedding, extractVoiceSignature } = require('../services/ai/pythonMlClient');

async function getProfile(req, res) {
  const userId = req.user.sub;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  let profile = null;
  if (user.role === 'faculty') {
    profile = await FacultyProfile.findOne({ user: userId });
    if (!profile) {
      profile = await FacultyProfile.create({ user: userId, email: user.email });
    }
  } else if (user.role === 'admin') {
    profile = {
      user: user._id,
      email: user.email,
      name: user.name,
      role: 'admin',
      faceEmbedding: user.faceEmbedding || [],
      voiceEmbedding: user.voiceEmbedding || [],
      biometricRegistered: user.biometricRegistered || false
    };
  } else {
    profile = await StudentProfile.findOne({ user: userId });
    if (!profile) {
      profile = await StudentProfile.create({ user: userId, email: user.email });
    }
  }

  return res.json({ profile, user });
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.sub;
    const updates = req.body || {};
    delete updates.user;

    if (req.file) {
      updates.profileImage = `/uploads/${req.file.filename}`;
    }

    const user = await User.findById(userId);
    let profile = null;
    if (user?.role === 'faculty') {
      profile = await FacultyProfile.findOneAndUpdate(
        { user: userId },
        { $set: updates },
        { new: true, upsert: true }
      );
    } else {
      profile = await StudentProfile.findOneAndUpdate(
        { user: userId },
        { $set: updates },
        { new: true, upsert: true }
      );
    }

    return res.json({ profile });
  } catch (err) {
    const msg = err.message || 'Upload failed';
    return res.status(400).json({ message: msg });
  }
}

async function enrollBiometrics(req, res) {
  try {
    const userId = req.user.sub;
    const { image, audio, faceDescriptor } = req.body;

    const updates = {};

    // Save the client-side face-api.js neural descriptor (128-dim, used for login verification)
    if (Array.isArray(faceDescriptor) && faceDescriptor.length === 128) {
      updates.faceDescriptor = faceDescriptor;
      updates.biometricRegistered = true;
      console.log(`[Biometrics] Neural face descriptor enrolled for user: ${userId} (128-dim from face-api.js)`);
    }

    if (image) {
      const faceResult = await extractFaceEmbedding(image);
      const isInvalid = !faceResult || !faceResult.embedding || faceResult.embedding.length === 0 || faceResult.embedding.every(v => v === 0);
      if (!isInvalid) {
        updates.faceEmbedding = faceResult.embedding;
        updates.biometricRegistered = true;
        console.log(`[Biometrics] Legacy face embedding enrolled for user: ${userId} (${faceResult.embedding.length} d)`);
      } else if (!faceDescriptor) {
        // Only fail if we also don't have the neural descriptor
        const errorMsg = faceResult?.error || 'Could not detect facial features. Please ensure your camera is showing your face clearly.';
        return res.status(400).json({ message: errorMsg });
      }
    }

    if (audio) {
      const voiceResult = await extractVoiceSignature(audio);
      if (voiceResult && voiceResult.voiceEmbedding) {
        updates.voiceEmbedding = voiceResult.voiceEmbedding;
      }
    }

    // 1. Update user document directly (Universal biometrics for Admin, Faculty, Student)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    );

    // 2. Role-specific profile updates
    let profile = null;
    if (updatedUser?.role === 'faculty') {
      profile = await FacultyProfile.findOneAndUpdate(
        { user: userId },
        { $set: updates },
        { new: true, upsert: true }
      );
    } else if (updatedUser?.role === 'student') {
      profile = await StudentProfile.findOneAndUpdate(
        { user: userId },
        { $set: updates },
        { new: true, upsert: true }
      );
    } else {
      profile = updatedUser;
    }

    return res.json({
      success: true,
      message: 'Biometrics enrolled successfully!',
      role: updatedUser?.role || 'student',
      biometricRegistered: true,
      hasFace: (updates.faceEmbedding || []).length > 0,
      hasVoice: (updates.voiceEmbedding || []).length > 0
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = { getProfile, updateProfile, enrollBiometrics };
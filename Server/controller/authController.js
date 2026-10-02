// controller/authController.js
const jwt = require('jsonwebtoken');
const { registerUser, loginUser } = require('../services/authService');
const User = require('../models/User');

function signToken(user) {
  const payload = { sub: user._id.toString(), email: user.email, role: user.role };
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

// Add this helper
function getRedirectPath(role) {
  if (role === 'student') return '/student/dashboard';
  if (role === 'faculty') return '/faculty/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/';
}

async function signup(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    const user = await registerUser({ name, email, password, role });
    const token = signToken(user);
    const redirectPath = getRedirectPath(user.role);
    return res.status(201).json({ user: user.toJSON(), token, redirectPath });
  } catch (err) {
    const status = err.status || 500;
    const message = err.status ? err.message : 'Internal server error';
    if (status === 500) console.error('Signup error:', err);
    return res.status(status).json({ message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }
    const user = await loginUser({ email, password });
    const token = signToken(user);
    const redirectPath = getRedirectPath(user.role);
    return res.json({ user: user.toJSON(), token, redirectPath });
  } catch (err) {
    const status = err.status || 500;
    const message = err.status ? err.message : 'Internal server error';
    if (status === 500) console.error('Login error:', err);
    return res.status(status).json({ message });
  }
}
async function refresh(req, res) {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const token = signToken(user);
  const redirectPath = getRedirectPath(user.role);
  return res.json({ user: user.toJSON(), token, redirectPath });
}

async function faceLogin(req, res) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const FacultyProfile = require('../models/FacultyProfile');
    const { matchClassPhotoFaces } = require('../services/ai/pythonMlClient');

    const { image, email } = req.body;
    if (!image) {
      return res.status(400).json({ message: 'Face image capture is required' });
    }

    if (email) {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) return res.status(404).json({ message: 'User not found with this email' });

      // Look up face embedding from User, StudentProfile, or FacultyProfile
      let userFaceEmbedding = (Array.isArray(user.faceEmbedding) && user.faceEmbedding.some(v => v !== 0))
        ? user.faceEmbedding
        : null;

      if (!userFaceEmbedding && user.role === 'student') {
        const profile = await StudentProfile.findOne({ user: user._id });
        if (profile?.faceEmbedding && profile.faceEmbedding.some(v => v !== 0)) {
          userFaceEmbedding = profile.faceEmbedding;
        }
      } else if (!userFaceEmbedding && user.role === 'faculty') {
        const fProfile = await FacultyProfile.findOne({ user: user._id });
        if (fProfile?.faceEmbedding && fProfile.faceEmbedding.some(v => v !== 0)) {
          userFaceEmbedding = fProfile.faceEmbedding;
        }
      }

      if (!userFaceEmbedding) {
        return res.status(400).json({
          message: `FaceID not enrolled for this ${user.role} account yet. Please sign in with password first to enroll in Profile.`
        });
      }

      const matchRes = await matchClassPhotoFaces(image, [{
        studentId: String(user._id),
        name: user.name || 'User',
        faceEmbedding: userFaceEmbedding
      }], 0.68);

      if (!matchRes || !matchRes.matchedCount || !matchRes.matches?.length) {
        return res.status(401).json({ message: 'Face does not match your enrolled profile. Please ensure bright lighting and face the camera directly.' });
      }

      const match = matchRes.matches[0];
      if ((match.similarity || 0) < 0.68) {
        return res.status(401).json({ message: 'Face verification failed: biometric similarity too low for this account.' });
      }

      const token = signToken(user);
      const redirectPath = getRedirectPath(user.role);
      return res.json({ user: user.toJSON(), token, redirectPath });
    }

    // Passwordless Scan across all enrolled users (Admin, Faculty, Students)
    const [allUsers, sProfiles, fProfiles] = await Promise.all([
      User.find({
        $or: [
          { biometricRegistered: true, 'faceEmbedding.0': { $exists: true } },
          { 'faceEmbedding.0': { $exists: true } }
        ]
      }).lean(),
      StudentProfile.find({ biometricRegistered: true, 'faceEmbedding.0': { $exists: true } }).lean(),
      FacultyProfile.find({ biometricRegistered: true, 'faceEmbedding.0': { $exists: true } }).lean()
    ]);

    const candidateMap = new Map();
    const userMap = new Map();

    for (const u of allUsers) {
      if (u.faceEmbedding && u.faceEmbedding.some(v => v !== 0)) {
        const uId = String(u._id);
        userMap.set(uId, u);
        candidateMap.set(uId, {
          studentId: uId,
          name: u.name || 'User',
          role: u.role,
          faceEmbedding: u.faceEmbedding
        });
      }
    }

    // Include student profiles
    for (const sp of sProfiles) {
      if (sp.faceEmbedding && sp.faceEmbedding.some(v => v !== 0)) {
        const uId = String(sp.user);
        if (!candidateMap.has(uId)) {
          candidateMap.set(uId, {
            studentId: uId,
            name: `${sp.firstName || ''} ${sp.lastName || ''}`.trim() || 'Student',
            role: 'student',
            faceEmbedding: sp.faceEmbedding
          });
        }
      }
    }

    // Include faculty profiles
    for (const fp of fProfiles) {
      if (fp.faceEmbedding && fp.faceEmbedding.some(v => v !== 0)) {
        const uId = String(fp.user);
        if (!candidateMap.has(uId)) {
          candidateMap.set(uId, {
            studentId: uId,
            name: `${fp.firstName || ''} ${fp.lastName || ''}`.trim() || 'Faculty',
            role: 'faculty',
            faceEmbedding: fp.faceEmbedding
          });
        }
      }
    }

    const candidates = Array.from(candidateMap.values());
    if (!candidates.length) {
      return res.status(400).json({ message: 'No accounts have enrolled FaceID biometrics yet. Please sign in with password first to enroll in Profile.' });
    }

    // Ensure all candidate user records are loaded
    const missingIds = candidates.map(c => c.studentId).filter(id => !userMap.has(id));
    if (missingIds.length > 0) {
      const extraUsers = await User.find({ _id: { $in: missingIds } }).lean();
      extraUsers.forEach(u => userMap.set(String(u._id), u));
    }

    const matchRes = await matchClassPhotoFaces(image, candidates, 0.72);
    if (!matchRes || !matchRes.matchedCount || !matchRes.matches.length) {
      return res.status(401).json({ message: 'Face not recognized. Only registered persons whose face matches can log in. Please enter your email or enroll in Profile.' });
    }

    const matchedCandidate = matchRes.matches[0];
    if ((matchedCandidate.similarity || 0) < 0.70) {
      return res.status(401).json({ message: 'Face match confidence insufficient. Please enter your registered email to verify directly.' });
    }

    const matchedUser = userMap.get(matchedCandidate.studentId);
    if (!matchedUser) {
      return res.status(404).json({ message: 'User account not found' });
    }

    const token = signToken(matchedUser);
    const redirectPath = getRedirectPath(matchedUser.role);
    return res.json({
      user: matchedUser,
      token,
      redirectPath,
      confidence: matchedCandidate.confidence
    });
  } catch (err) {
    console.error('FaceLogin error:', err);
    return res.status(500).json({ message: err.message || 'Face login error' });
  }
}

module.exports = { signup, login, refresh, faceLogin };
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
    const { email, liveDescriptor } = req.body;

    // SECURITY: Email is always required
    if (!email) {
      return res.status(400).json({ message: 'Email is required for Face ID login.' });
    }

    // SECURITY: liveDescriptor (from face-api.js neural network) must be present
    // The client already compared it against the enrolled descriptor — this is the 2nd check.
    if (!Array.isArray(liveDescriptor) || liveDescriptor.length !== 128) {
      return res.status(400).json({ message: 'Face verification data missing. Please retry.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'No account found with this email.' });

    // Load enrolled neural descriptor from profile
    const StudentProfile = require('../models/StudentProfile');
    const FacultyProfile = require('../models/FacultyProfile');

    let enrolledDescriptor = null;

    // Check User model first
    if (Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128) {
      enrolledDescriptor = user.faceDescriptor;
    }

    // Check role-specific profile
    if (!enrolledDescriptor && user.role === 'student') {
      const p = await StudentProfile.findOne({ user: user._id }).lean();
      if (Array.isArray(p?.faceDescriptor) && p.faceDescriptor.length === 128) {
        enrolledDescriptor = p.faceDescriptor;
      }
    } else if (!enrolledDescriptor && user.role === 'faculty') {
      const p = await FacultyProfile.findOne({ user: user._id }).lean();
      if (Array.isArray(p?.faceDescriptor) && p.faceDescriptor.length === 128) {
        enrolledDescriptor = p.faceDescriptor;
      }
    }

    if (!enrolledDescriptor) {
      return res.status(400).json({
        message: 'Face ID not enrolled for this account. Please sign in with password first, then enroll Face ID in your Profile.'
      });
    }

    // SERVER-SIDE neural distance verification (prevents bypassing client-side check)
    const live = liveDescriptor;
    const enrolled = enrolledDescriptor;
    let dist = 0;
    for (let i = 0; i < 128; i++) {
      dist += (live[i] - enrolled[i]) ** 2;
    }
    dist = Math.sqrt(dist);
    console.log('[FaceLogin] Server-side neural face distance:', dist.toFixed(4), 'for:', email);

    // Threshold: same person < 0.52, different person > 0.60
    if (dist > 0.52) {
      return res.status(401).json({
        message: `Face does not match the enrolled Face ID (distance: ${dist.toFixed(2)}). Ensure good lighting and face the camera directly.`
      });
    }

    // All checks passed — issue JWT
    const token = signToken(user);
    const redirectPath = getRedirectPath(user.role);
    console.log('[FaceLogin] SUCCESS for:', email, '| distance:', dist.toFixed(4));
    return res.json({ user: user.toJSON(), token, redirectPath });

  } catch (err) {
    console.error('FaceLogin error:', err);
    return res.status(500).json({ message: err.message || 'Face login error' });
  }
}
/**
 * GET /auth/face-descriptor?email=xxx
 * Returns the enrolled face descriptor for a given email so the
 * client-side face-api.js can compare locally before sending token request.
 */
async function getFaceDescriptor(req, res) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const FacultyProfile = require('../models/FacultyProfile');
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    let desc = null;

    // Check User model first (legacy)
    if (Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128) {
      desc = user.faceDescriptor;
    }

    // Check role-specific profile
    if (!desc && user.role === 'student') {
      const p = await StudentProfile.findOne({ user: user._id }).lean();
      if (p?.faceDescriptor?.length === 128) desc = p.faceDescriptor;
    } else if (!desc && user.role === 'faculty') {
      const p = await FacultyProfile.findOne({ user: user._id }).lean();
      if (p?.faceDescriptor?.length === 128) desc = p.faceDescriptor;
    }

    if (!desc) {
      return res.status(404).json({ message: 'Face ID not enrolled for this account' });
    }

    return res.json({ faceDescriptor: desc });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

/**
 * POST /auth/face-login (updated)
 * Face comparison is now done client-side with face-api.js.
 * This endpoint only issues the JWT token after confirming email is valid
 * and liveDescriptor was already verified client-side.
 */

module.exports = { signup, login, refresh, faceLogin, getFaceDescriptor };
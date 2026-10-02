const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function registerUser({ name, email, password, role }) {
  const exists = await User.findOne({ email });
  if (exists) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await User.create({
    name,
    email,
    passwordHash,
   role: role || 'student'
  });

  return user;
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email, isActive: true });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  return user;
}

module.exports = { registerUser, loginUser };
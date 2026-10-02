const User = require('../models/User');

async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body;
  if (!['admin', 'faculty', 'student'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const user = await User.findByIdAndUpdate(id, { role }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ user: user.toJSON() });
}

module.exports = { updateUserRole };
// Server/middleware/auth.js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Normalize user shape on req.user
    // Common JWT fields for user id: sub, id, _id, userId
    const id =
      payload.sub ||
      payload.id ||
      payload._id ||
      payload.userId ||
      null;

    if (!id) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    req.user = {
      id: String(id),
      _id: String(id),
      role: payload.role || payload.userRole || null,
      email: payload.email || null,
      // keep original payload in case other fields are needed
      ...payload,
    };

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = requireAuth;
const Attendance = require('../models/Attendance');

function normalizeDate(v) { const d = new Date(v); d.setHours(0,0,0,0); return d; }

exports.myAttendance = async (req, res, next) => {
  try {
    const { from, to, date, session } = req.query;
    const q = { userId: req.user._id };
    if (date) q.date = normalizeDate(date);
    if (from) q.date = Object.assign(q.date || {}, { $gte: normalizeDate(from) });
    if (to) q.date = Object.assign(q.date || {}, { $lte: normalizeDate(to) });

    const docs = await Attendance.find(q).sort({ date: -1 }).lean();

    // Optional: if session is provided, only include that session’s entry per day
    const items = (docs || []).map(d => {
      if (!session) return d;
      const entry = (d.dailySchedule || []).find(s => s.session === session);
      return Object.assign({}, d, { dailySchedule: entry ? [entry] : [] });
    });

    res.json({ items });
  } catch (e) { next(e); }
};
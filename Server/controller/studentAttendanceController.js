const Attendance = require('../models/Attendance');
const { createNotification } = require('./notificationController');
const Notification = require('../models/Notification');

function normalizeDate(v, fallbackDaysAgo = 0) {
  if (!v || v === 'undefined' || v === 'null') {
    const d = new Date();
    d.setDate(d.getDate() - fallbackDaysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - fallbackDaysAgo);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

exports.myAttendance = async (req, res, next) => {
  try {
    const { from, to, date, session } = req.query;
    const q = { userId: req.user._id };
    if (date) q.date = normalizeDate(date);
    if (from) q.date = Object.assign(q.date || {}, { $gte: normalizeDate(from, 30) });
    if (to) q.date = Object.assign(q.date || {}, { $lte: normalizeDate(to, 0) });

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

// GET /api/student/attendance/trends - Predictive 75% threshold analysis & recovery calculator
exports.myAttendanceTrends = async (req, res, next) => {
  try {
    const userId = req.user._id;
    // Fetch all records sorted chronologically for trend analysis
    const docs = await Attendance.find({ userId }).sort({ date: 1 }).lean();

    if (!docs || docs.length === 0) {
      return res.json({
        overall: {
          totalClasses: 0,
          attendedClasses: 0,
          percentage: 0,
          trend: 'STABLE',
          projectedPercentage: 0,
          status: 'SAFE',
          classesToAttend75: 0,
          classesCanMiss75: 0
        },
        subjects: [],
        alerts: []
      });
    }

    // 1. Compute overall totals
    let totalClasses = 0;
    let attendedClasses = 0;
    const historicalPcts = [];

    // 2. Track per-subject statistics
    const subjectMap = {};

    for (const doc of docs) {
      let docTotal = doc.totalClasses || 0;
      let docAttended = (doc.presentClasses || 0) + (doc.onDutyClasses || 0);

      // If docTotal is 0 but dailySchedule has items, calculate from schedule
      if (docTotal === 0 && Array.isArray(doc.dailySchedule) && doc.dailySchedule.length > 0) {
        docTotal = doc.dailySchedule.length;
        docAttended = doc.dailySchedule.filter(s => s.status === 'PRESENT' || s.status === 'ON-DUTY').length;
      }

      totalClasses += docTotal;
      attendedClasses += docAttended;

      if (totalClasses > 0) {
        historicalPcts.push(Math.round((attendedClasses / totalClasses) * 100));
      }

      // Process individual subject sessions
      if (Array.isArray(doc.dailySchedule)) {
        for (const session of doc.dailySchedule) {
          const subName = (session.subject || 'General Class').trim();
          if (!subjectMap[subName]) {
            subjectMap[subName] = {
              subject: subName,
              total: 0,
              attended: 0,
              history: []
            };
          }
          subjectMap[subName].total += 1;
          const isAtt = session.status === 'PRESENT' || session.status === 'ON-DUTY';
          if (isAtt) subjectMap[subName].attended += 1;
          subjectMap[subName].history.push(isAtt ? 1 : 0);
        }
      }
    }

    const overallPct = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 1000) / 10 : 0;

    // Trend calculation using linear slope across recent historical points
    let trend = 'STABLE';
    let projectedPercentage = overallPct;
    if (historicalPcts.length >= 3) {
      const recent = historicalPcts.slice(-8);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const diff = last - first;
      if (diff >= 3) trend = 'RISING';
      else if (diff <= -3) trend = 'FALLING';
      projectedPercentage = Math.max(0, Math.min(100, Math.round((last + diff * 0.5) * 10) / 10));
    }

    // Recovery & Bunk Calculator for Overall
    // Attended / (Total + y) >= 0.75 => y = floor((Attended - 0.75 * Total) / 0.75)
    // (Attended + x) / (Total + x) >= 0.75 => x = ceil((0.75 * Total - Attended) / 0.25)
    let classesToAttend75 = 0;
    let classesCanMiss75 = 0;
    let overallStatus = 'SAFE';

    if (overallPct < 75) {
      overallStatus = 'CRITICAL_DETAINED';
      classesToAttend75 = Math.max(0, Math.ceil((0.75 * totalClasses - attendedClasses) / 0.25));
    } else {
      overallStatus = overallPct <= 78 ? 'WARNING_APPROACHING' : 'SAFE';
      classesCanMiss75 = Math.max(0, Math.floor((attendedClasses - 0.75 * totalClasses) / 0.75));
    }

    // Format Per-Subject Analytics
    const subjects = Object.values(subjectMap).map(sub => {
      const pct = sub.total > 0 ? Math.round((sub.attended / sub.total) * 1000) / 10 : 0;
      let subClassesToAttend = 0;
      let subClassesCanMiss = 0;
      let subStatus = 'SAFE';

      if (pct < 75) {
        subStatus = 'CRITICAL_DETAINED';
        subClassesToAttend = Math.max(0, Math.ceil((0.75 * sub.total - sub.attended) / 0.25));
      } else {
        subStatus = pct <= 78 ? 'WARNING_APPROACHING' : 'SAFE';
        subClassesCanMiss = Math.max(0, Math.floor((sub.attended - 0.75 * sub.total) / 0.75));
      }

      // Recent trend for subject
      const recentSub = sub.history.slice(-5);
      const recentRate = recentSub.length > 0 ? recentSub.filter(v => v === 1).length / recentSub.length : 1;
      let subTrend = 'STABLE';
      if (recentRate > 0.8) subTrend = 'RISING';
      else if (recentRate < 0.6) subTrend = 'FALLING';

      return {
        subject: sub.subject,
        totalClasses: sub.total,
        attendedClasses: sub.attended,
        percentage: pct,
        status: subStatus,
        trend: subTrend,
        classesToAttend75: subClassesToAttend,
        classesCanMiss75: subClassesCanMiss
      };
    });

    // Generate alerts for critical / approaching shortage
    const alerts = [];
    if (overallPct < 75 && totalClasses > 0) {
      alerts.push({
        severity: 'CRITICAL',
        type: 'OVERALL',
        title: 'Examination Eligibility Risk: Attendance Below 75%',
        message: `Your aggregate attendance is currently ${overallPct}%. You need to attend ${classesToAttend75} consecutive class session(s) without absence to cross the mandatory 75% threshold.`
      });

      // Proactive Notification Dispatch (rate-limited to 1 per 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentNotif = await Notification.findOne({
        recipientId: userId,
        type: 'ATTENDANCE_CRITICAL',
        createdAt: { $gte: oneDayAgo }
      }).lean();

      if (!recentNotif) {
        await createNotification({
          recipientId: userId,
          type: 'ATTENDANCE_CRITICAL',
          title: '⚠️ Critical Attendance Alert (< 75%)',
          message: `Your overall attendance is ${overallPct}%. You are currently ineligible for semester examinations. Attend the next ${classesToAttend75} consecutive classes to recover eligibility.`,
          metadata: { overallPct, classesToAttend75 }
        });
      }
    } else if (overallPct <= 78 && totalClasses > 0) {
      alerts.push({
        severity: 'WARNING',
        type: 'OVERALL',
        title: 'Attendance Approaching 75% Danger Zone',
        message: `Your attendance is ${overallPct}%. You can only miss ${classesCanMiss75} more class session(s) before losing exam eligibility.`
      });
    }

    // Subject-specific alerts
    subjects.filter(s => s.status === 'CRITICAL_DETAINED').forEach(s => {
      alerts.push({
        severity: 'CRITICAL',
        type: 'SUBJECT',
        subject: s.subject,
        title: `Low Attendance in ${s.subject} (${s.percentage}%)`,
        message: `Subject attendance is below 75%. You need to attend ${s.classesToAttend75} more class(es) to recover.`
      });
    });

    return res.json({
      overall: {
        totalClasses,
        attendedClasses,
        percentage: overallPct,
        trend,
        projectedPercentage,
        status: overallStatus,
        classesToAttend75,
        classesCanMiss75
      },
      subjects,
      alerts
    });
  } catch (e) {
    next(e);
  }
};
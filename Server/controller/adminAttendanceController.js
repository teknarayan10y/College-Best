const Attendance = require('../models/Attendance');

function normalizeDate(v) {
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  return d;
}

function recomputeCounters(doc) {
  const sessions = Array.isArray(doc.dailySchedule) ? doc.dailySchedule : [];
  const total = sessions.length;
  const present = sessions.filter(s => s.status === 'PRESENT').length;
  const onDuty = sessions.filter(s => s.status === 'ON-DUTY').length;
  const absent = sessions.filter(s => s.status === 'ABSENT').length;
  doc.totalClasses = total;
  doc.presentClasses = present;
  doc.onDutyClasses = onDuty;
  doc.absentClasses = absent;
}

exports.list = async (req, res, next) => {
  try {
    const { date, academicYear, semester, userId, page = 1, limit = 50 } = req.query;
    const q = {};
    if (date) q.date = normalizeDate(date);
    if (academicYear) q.academicYear = academicYear;
    if (semester) q.semester = semester;
    if (userId) q.userId = userId;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Attendance.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Attendance.countDocuments(q)
    ]);
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (e) {
    next(e);
  }
};

exports.markSession = async (req, res, next) => {
  try {
    const { userId, date, session, status, subject = '', faculty = '', topic = '', academicYear = '2025-26', semester = 'Odd' } = req.body;
    if (!userId || !date || !session || !status) return res.status(400).json({ message: 'userId, date, session, status are required' });
    const d = normalizeDate(date);
    let doc = await Attendance.findOne({ userId, date: d });
    if (!doc) {
      doc = new Attendance({ userId, date: d, academicYear, semester, dailySchedule: [] });
    } else {
      doc.academicYear = academicYear || doc.academicYear;
      doc.semester = semester || doc.semester;
    }
    const idx = doc.dailySchedule.findIndex(s => s.session === session);
    const entry = { session, status, subject, faculty, topic, date: d };
    if (idx >= 0) doc.dailySchedule[idx] = entry; else doc.dailySchedule.push(entry);
    recomputeCounters(doc);
    await doc.save();
    res.json({ item: doc });
  } catch (e) {
    next(e);
  }
};

exports.bulkDay = async (req, res, next) => {
  try {
    const { date, academicYear = '2025-26', semester = 'Odd', items = [] } = req.body;
    if (!date || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'date and items required' });
    const d = normalizeDate(date);
    const results = [];
    for (const it of items) {
      const { userId, session, status, subject = '', faculty = '', topic = '' } = it;
      if (!userId || !session || !status) continue;
      let doc = await Attendance.findOne({ userId, date: d });
      if (!doc) {
        doc = new Attendance({ userId, date: d, academicYear, semester, dailySchedule: [] });
      } else {
        doc.academicYear = academicYear || doc.academicYear;
        doc.semester = semester || doc.semester;
      }
      const idx = doc.dailySchedule.findIndex(s => s.session === session);
      const entry = { session, status, subject, faculty, topic, date: d };
      if (idx >= 0) doc.dailySchedule[idx] = entry; else doc.dailySchedule.push(entry);
      recomputeCounters(doc);
      await doc.save();
      results.push(doc._id);
    }
    res.json({ ok: true, count: results.length });
  } catch (e) {
    next(e);
  }
};

exports.summary = async (req, res, next) => {
  try {
    const { from, to, academicYear, semester } = req.query;
    const match = {};
    if (from) match.date = Object.assign(match.date || {}, { $gte: normalizeDate(from, 30) });
    if (to) match.date = Object.assign(match.date || {}, { $lte: normalizeDate(to, 0) });
    if (academicYear) match.academicYear = academicYear;
    if (semester) match.semester = semester;
    const agg = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: '$totalClasses' },
          presentClasses: { $sum: '$presentClasses' },
          onDutyClasses: { $sum: '$onDutyClasses' },
          absentClasses: { $sum: '$absentClasses' }
        }
      }
    ]);
    const row = agg[0] || { totalClasses: 0, presentClasses: 0, onDutyClasses: 0, absentClasses: 0 };
    res.json({ totals: row });
  } catch (e) {
    next(e);
  }
};

// POST /api/admin/attendance/ai-scan-photo
// target: 'student' | 'faculty'
exports.aiScanPhoto = async (req, res, next) => {
  try {
    const { target = 'student', image, threshold = 0.45 } = req.body;
    if (!image) {
      return res.status(400).json({ message: 'Image capture or upload is required' });
    }

    const { matchClassPhotoFaces } = require('../services/ai/pythonMlClient');
    const User = require('../models/User');
    const StudentProfile = require('../models/StudentProfile');
    const FacultyProfile = require('../models/FacultyProfile');

    let candidates = [];

    if (target === 'faculty') {
      const [facUsers, fProfiles] = await Promise.all([
        User.find({ role: 'faculty' }).lean(),
        FacultyProfile.find({}).lean()
      ]);

      const profMap = new Map(fProfiles.map(p => [String(p.user), p]));

      for (const fu of facUsers) {
        const uId = String(fu._id);
        const fp = profMap.get(uId);
        const emb = (fu.faceEmbedding && fu.faceEmbedding.some(v => v !== 0))
          ? fu.faceEmbedding
          : (fp?.faceEmbedding && fp.faceEmbedding.some(v => v !== 0) ? fp.faceEmbedding : null);

        if (emb) {
          candidates.push({
            studentId: uId,
            name: fu.name || `${fp?.firstName || ''} ${fp?.lastName || ''}`.trim() || 'Faculty Member',
            department: fp?.department || '',
            role: 'faculty',
            faceEmbedding: emb
          });
        }
      }
    } else {
      const [stuUsers, sProfiles] = await Promise.all([
        User.find({ role: 'student' }).lean(),
        StudentProfile.find({}).lean()
      ]);

      const profMap = new Map(sProfiles.map(p => [String(p.user), p]));

      for (const su of stuUsers) {
        const uId = String(su._id);
        const sp = profMap.get(uId);
        const emb = (su.faceEmbedding && su.faceEmbedding.some(v => v !== 0))
          ? su.faceEmbedding
          : (sp?.faceEmbedding && sp.faceEmbedding.some(v => v !== 0) ? sp.faceEmbedding : null);

        if (emb) {
          candidates.push({
            studentId: uId,
            name: su.name || `${sp?.firstName || ''} ${sp?.lastName || ''}`.trim() || 'Student',
            rollNo: sp?.rollNo || sp?.registerNumber || '',
            department: sp?.branch || sp?.department || '',
            role: 'student',
            faceEmbedding: emb
          });
        }
      }
    }

    if (!candidates.length) {
      return res.status(400).json({
        message: `No ${target} members have enrolled their FaceID yet.`
      });
    }

    const mlResult = await matchClassPhotoFaces(image, candidates, threshold);
    if (!mlResult) {
      return res.status(503).json({ message: 'AI ML service unavailable. Please ensure python ml_service is running on port 8000.' });
    }

    res.json({
      success: true,
      target,
      totalEnrolled: candidates.length,
      facesDetected: mlResult.facesDetected || 0,
      matchedCount: mlResult.matchedCount || 0,
      matches: mlResult.matches || [],
      unmatchedFacesCount: mlResult.unmatchedFacesCount || 0
    });
  } catch (e) {
    next(e);
  }
};

// POST /api/admin/attendance/ai-scan-voice
exports.aiScanVoice = async (req, res, next) => {
  try {
    const { target = 'student', audio, threshold = 0.50 } = req.body;
    if (!audio) {
      return res.status(400).json({ message: 'Audio recording is required' });
    }

    const { matchVoiceRollCall } = require('../services/ai/pythonMlClient');
    const User = require('../models/User');
    const StudentProfile = require('../models/StudentProfile');
    const FacultyProfile = require('../models/FacultyProfile');

    let candidates = [];

    if (target === 'faculty') {
      const [facUsers, fProfiles] = await Promise.all([
        User.find({ role: 'faculty' }).lean(),
        FacultyProfile.find({}).lean()
      ]);
      const profMap = new Map(fProfiles.map(p => [String(p.user), p]));
      for (const fu of facUsers) {
        const uId = String(fu._id);
        const fp = profMap.get(uId);
        const emb = (fu.voiceEmbedding && fu.voiceEmbedding.some(v => v !== 0))
          ? fu.voiceEmbedding
          : (fp?.voiceEmbedding && fp.voiceEmbedding.some(v => v !== 0) ? fp.voiceEmbedding : null);
        if (emb) {
          candidates.push({
            studentId: uId,
            name: fu.name || `${fp?.firstName || ''} ${fp?.lastName || ''}`.trim() || 'Faculty Member',
            voiceEmbedding: emb
          });
        }
      }
    } else {
      const [stuUsers, sProfiles] = await Promise.all([
        User.find({ role: 'student' }).lean(),
        StudentProfile.find({}).lean()
      ]);
      const profMap = new Map(sProfiles.map(p => [String(p.user), p]));
      for (const su of stuUsers) {
        const uId = String(su._id);
        const sp = profMap.get(uId);
        const emb = (su.voiceEmbedding && su.voiceEmbedding.some(v => v !== 0))
          ? su.voiceEmbedding
          : (sp?.voiceEmbedding && sp.voiceEmbedding.some(v => v !== 0) ? sp.voiceEmbedding : null);
        if (emb) {
          candidates.push({
            studentId: uId,
            name: su.name || `${sp?.firstName || ''} ${sp?.lastName || ''}`.trim() || 'Student',
            voiceEmbedding: emb
          });
        }
      }
    }

    if (!candidates.length) {
      return res.status(400).json({
        message: `No ${target} members have enrolled their Voice biometrics yet.`
      });
    }

    const mlResult = await matchVoiceRollCall(audio, candidates, threshold);
    if (!mlResult) {
      return res.status(503).json({ message: 'AI ML service unavailable. Please ensure python ml_service is running on port 8000.' });
    }

    res.json({
      success: true,
      target,
      matched: mlResult.matched || false,
      person: mlResult.student || null,
      confidence: mlResult.confidence || 0.0
    });
  } catch (e) {
    next(e);
  }
};
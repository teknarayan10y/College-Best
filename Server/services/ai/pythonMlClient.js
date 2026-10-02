/**
 * NexusMind AI - Python ML Client
 * Connects Node.js Express to the Python ML Sidecar Service (http://localhost:8000).
 * Features automatic and silent fallback to Node.js mathematical algorithms if Python is offline.
 */

const http = require('http');

const ML_SERVICE_URL = process.env.PYTHON_ML_URL || 'http://localhost:8000';

/**
 * Low-latency internal HTTP POST requester with strict 600ms timeout
 */
function postToMl(endpoint, data, timeoutMs = 600) {
  return new Promise((resolve) => {
    try {
      const url = new URL(endpoint, ML_SERVICE_URL);
      const postData = JSON.stringify(data || {});

      const options = {
        hostname: url.hostname,
        port: url.port || 8000,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: timeoutMs
      };

      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(rawData));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => { resolve(null); });
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.write(postData);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Statistical Anomaly Detection (Python with JS fallback)
 */
async function detectAnomalies(records = []) {
  const pyResult = await postToMl('/api/ml/anomaly', { records });
  if (pyResult && pyResult.status) return pyResult;

  // Node.js Fallback
  if (!records || records.length < 3) {
    return { status: 'NOMINAL', anomaliesDetected: 0, anomalies: [] };
  }

  const pcts = records.map(r => Number(r.percentage || 0));
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const variance = pcts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pcts.length;
  const std = Math.sqrt(variance);

  const anomalies = [];
  records.forEach((r, i) => {
    const pct = Number(r.percentage || 0);
    const z = std > 0 ? (pct - mean) / std : 0;
    if (Math.abs(z) >= 1.96 || pct < 65) {
      anomalies.push({
        index: i,
        record: r,
        zScore: Math.round(z * 100) / 100,
        severity: pct < 60 ? 'HIGH' : 'MEDIUM'
      });
    }
  });

  return {
    status: anomalies.length > 0 ? 'ANOMALIES_DETECTED' : 'NOMINAL',
    meanAttendance: Math.round(mean * 100) / 100,
    stdDeviation: Math.round(std * 100) / 100,
    anomaliesDetected: anomalies.length,
    anomalies
  };
}

/**
 * 30-Day Trend Velocity Forecast (Python with JS fallback)
 */
async function calculateForecast(historicalPercentages = [], currentPercentage = 80) {
  const pyResult = await postToMl('/api/ml/forecast', { historicalPercentages, currentPercentage });
  if (pyResult && pyResult.velocity) return pyResult;

  // Node.js Fallback
  if (!historicalPercentages || historicalPercentages.length < 2) {
    return {
      velocity: 'STABLE',
      slope: 0,
      projected30Day: Number(currentPercentage),
      currentPercentage: Number(currentPercentage)
    };
  }

  const n = historicalPercentages.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = Number(historicalPercentages[i]);
    sumX += x;
    sumY += y;
    sumXY += (x * y);
    sumXX += (x * x);
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  const projected = Math.min(100, Math.max(0, slope * (n + 4) + intercept));

  let velocity = 'STABLE';
  if (slope > 0.4) velocity = 'UPWARD';
  else if (slope < -0.4) velocity = 'DOWNWARD';

  return {
    velocity,
    slope: Math.round(slope * 10000) / 10000,
    projected30Day: Math.round(projected * 100) / 100,
    currentPercentage: Number(currentPercentage)
  };
}

/**
 * Multi-Factor Risk Score (Python with JS fallback)
 */
async function evaluateRiskScore(attendancePercentage = 80, gpa = 7.5, pendingAssignments = 0) {
  const pyResult = await postToMl('/api/ml/risk-score', { attendancePercentage, gpa, pendingAssignments });
  if (pyResult && pyResult.riskLevel) return pyResult;

  // Node.js Fallback
  const attRisk = Math.max(0, 75 - attendancePercentage) * 2.0;
  const gpaRisk = Math.max(0, 6.0 - gpa) * 15.0;
  const assignRisk = Math.min(pendingAssignments * 5.0, 20.0);

  const totalRisk = Math.min(100, Math.max(0, attRisk + gpaRisk + assignRisk));
  let level = 'LOW';
  if (totalRisk >= 60) level = 'CRITICAL';
  else if (totalRisk >= 40) level = 'HIGH';
  else if (totalRisk >= 20) level = 'MEDIUM';

  return {
    riskScore: Math.round(totalRisk * 10) / 10,
    riskLevel: level,
    academicHealthScore: Math.max(0, Math.min(100, Math.round(100 - totalRisk))),
    recommendation: level === 'LOW' ? 'Optimal Standing' : 'Academic Advisory Recommended'
  };
}

/**
 * What-If Policy Simulation (Python with JS fallback)
 */
async function runSimulation(cohort = [], params = {}) {
  // Support either (cohort, params) or ({ cohort, params })
  let actualCohort = Array.isArray(cohort) ? cohort : (cohort?.cohort && Array.isArray(cohort.cohort) ? cohort.cohort : []);
  let actualParams = (cohort && !Array.isArray(cohort) && !cohort.cohort) ? cohort : (params || {});

  const pyResult = await postToMl('/api/ml/simulate', { cohort: actualCohort, params: actualParams });
  if (pyResult && pyResult.totalCohortSize !== undefined) return pyResult;

  // Node.js Fallback
  const threshold = Number(actualParams.threshold || actualParams.condonationCutoff || 75);
  const holidayCount = Number(actualParams.holidayCount || 0);
  const remedialClasses = Number(actualParams.remedialClasses || 0);

  let prevShortage = 0;
  let simShortage = 0;
  const retainedStudents = [];

  actualCohort.forEach(st => {
    const origTot = Math.max(1, Number(st.totalClasses || 1));
    const origPres = Number(st.presentClasses || 0);
    const origPct = Math.round((origPres / origTot) * 10000) / 100;

    const simTot = Math.max(1, origTot - holidayCount + remedialClasses);
    const simPres = Math.max(0, origPres + remedialClasses);
    const simPct = Math.min(100, Math.max(0, Math.round((simPres / simTot) * 10000) / 100));

    const wasShort = origPct < 75;
    const isShort = simPct < threshold;

    if (wasShort) prevShortage++;
    if (isShort) simShortage++;
    if (wasShort && !isShort) {
      retainedStudents.push({
        name: st.name || 'Student',
        rollNo: st.rollNo || 'N/A',
        originalPct: origPct,
        simulatedPct: simPct
      });
    }
  });

  const netRetained = Math.max(0, prevShortage - simShortage);

  return {
    totalCohortSize: cohort.length,
    simulatedThreshold: threshold,
    holidayDeltasApplied: holidayCount,
    remedialClassesAdded: remedialClasses,
    previousShortageCount: prevShortage,
    simulatedShortageCount: simShortage,
    netStudentsRetained: netRetained,
    averageAttendanceShift: cohort.length > 0 ? (remedialClasses * 1.5) : 0,
    retainedStudents: retainedStudents.slice(0, 10),
    recommendation: netRetained > 0
      ? `Simulated parameters successfully qualify ${netRetained} student(s) for examinations.`
      : 'Simulated parameters preserve baseline attendance distributions.'
  };
}

/**
 * Multi-Variable Intervention Prioritization (Python with JS fallback)
 */
async function prioritizeInterventions(students = []) {
  const pyResult = await postToMl('/api/ml/prioritize-interventions', { students });
  if (pyResult && pyResult.rankedInterventions) return pyResult;

  // Node.js Fallback
  const ranked = (students || []).map(st => {
    const att = Number(st.attendancePct || st.percentage || 75);
    const cgpa = Number(st.cgpa || 7.0);
    const pending = Number(st.pendingAssignments || 0);

    const attDeficit = Math.max(0, 75 - att);
    const cgpaDeficit = Math.max(0, 6.0 - cgpa);
    const urgency = (attDeficit * 2.5) + (cgpaDeficit * 15.0) + (pending * 6.0);

    let tier = 'TIER_3_MONITOR';
    let action = 'Routine classroom monitoring and check-in.';
    if (urgency >= 45) {
      tier = 'TIER_1_CRITICAL';
      action = 'Immediate formal notice & parent-mentor conference required.';
    } else if (urgency >= 20) {
      tier = 'TIER_2_MODERATE';
      action = 'Schedule faculty doubt session & assignment recovery submission.';
    }

    return {
      studentId: st.studentId || '',
      name: st.name || 'Student',
      rollNo: st.rollNo || 'N/A',
      attendancePct: att,
      cgpa,
      urgencyScore: Math.round(urgency * 10) / 10,
      urgencyTier: tier,
      recommendedAction: action,
      draftNoticeText: `Academic Advisory: ${st.name || 'Student'} (Roll: ${st.rollNo || 'N/A'}) has an attendance of ${att}%. Attending upcoming consecutive classes is required to avoid exam shortage.`
    };
  });

  ranked.sort((a, b) => b.urgencyScore - a.urgencyScore);

  return {
    totalEvaluated: students.length,
    criticalCount: ranked.filter(s => s.urgencyTier === 'TIER_1_CRITICAL').length,
    rankedInterventions: ranked
  };
}

/**
 * Dynamic Syllabus Question & Quiz Generator (Offline Python ML / Local LLM / JS Fallback)
 */
async function generateQuiz(syllabusText = '', count = 5, sourceName = 'Course Syllabus') {
  const safeCount = Math.max(1, Math.min(25, Number(count) || 5));
  console.log(`[Quiz] Requesting ${safeCount} questions from syllabus text (${syllabusText.length} chars) via Python sidecar...`);
  const pyResult = await postToMl('/api/ml/generate-quiz', {
    syllabusText,
    numQuestions: safeCount,
    sourceName
  }, 90000);  // 90s — Ollama on CPU takes 30-60s

  if (pyResult && pyResult.quizText) {
    return pyResult;
  }

  // Node.js local fallback if Python is offline or PDF is scanned with no text
  if (!syllabusText || syllabusText.trim().length < 20) {
    return {
      engine: "NexusMind Notice",
      count: safeCount,
      quizText: `⚠️ **Could Not Extract Text from \`${sourceName}\`**\n\n` +
        `The uploaded PDF appears to be a **scanned image or photograph** with no selectable digital text layer.\n\n` +
        `**To generate questions from your exact syllabus:**\n` +
        `1. Please upload a PDF that has **selectable digital text** (where you can highlight text with your mouse), or\n` +
        `2. Copy and paste the unit topics directly into the chat (e.g. *"Unit 1: ..., Unit 2: ... give me 5 questions"*).`,
      source: sourceName
    };
  }
}

/**
 * Post-process Ollama response: detect raw JSON and convert to readable markdown
 */
function cleanOllamaResponse(text) {
  if (!text) return text;

  // Detect if the entire response is a JSON object or array
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed);
      // It's a single question object
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.question) {
        const q = parsed;
        const opts = (q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n');
        return `**Q1: ${q.question}**\n\n${opts}\n\n👉 **Answer:** ${q.answer || q.correct || ''}\n*${q.explanation || ''}*`;
      }
      // It's an array of questions
      if (Array.isArray(parsed)) {
        return parsed.map((q, idx) => {
          const opts = (q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n');
          return `**Q${idx + 1}: ${q.question || q.q || ''}**\n\n${opts}\n\n👉 **Answer:** ${q.answer || q.correct || ''}\n*${q.explanation || ''}*`;
        }).join('\n\n---\n\n');
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }
  return text;
}

/**
 * Build comprehensive student portal records for local offline LLM (e.g. phi3)
 */
function buildFullStudentPortalContext(context) {
  if (!context || Object.keys(context).length === 0) return 'No student portal records available.';

  const info = context.studentInfo || {};
  const att = context.attendance || {};
  const marks = context.marks || [];
  const courses = context.courses || [];
  const pending = context.pendingAssignments || [];
  const completed = context.completedAssignments || [];
  const twin = context.personalDigitalTwin || {};

  const lines = [];

  // 1. Student Identity & Academic Profile
  lines.push('=== STUDENT PORTAL PROFILE ===');
  lines.push(`• Name: ${info.name || 'Student'}`);
  if (info.rollNo) lines.push(`• Roll Number: ${info.rollNo}`);
  if (info.registerNumber) lines.push(`• Register Number: ${info.registerNumber}`);
  if (info.studentId) lines.push(`• Student ID: ${info.studentId}`);
  lines.push(`• Program/Branch: ${info.program || info.branch || 'N/A'}`);
  lines.push(`• Current Semester: ${info.semester || 'N/A'}${info.section ? ' (Section ' + info.section + ')' : ''}`);
  lines.push(`• CGPA: ${info.cgpa || 'N/A'}`);
  if (info.email) lines.push(`• Email: ${info.email}`);
  if (info.phone) lines.push(`• Contact Phone: ${info.phone}`);
  if (info.bloodGroup) lines.push(`• Blood Group: ${info.bloodGroup}`);

  // 2. Attendance Statistics & Breakdown
  lines.push('\n=== ATTENDANCE RECORDS ===');
  lines.push(`• Overall Attendance: ${att.percentage || 0}% (${att.effectivePresent || 0}/${att.totalClasses || 0} classes attended) — ${att.status || 'N/A'}`);
  lines.push(`• Safe to Miss: ${att.safeToMiss || 0} class(es) while staying above 75%`);
  lines.push(`• Classes needed to reach 75%: ${att.neededTo75 || 0} consecutive class(es)`);
  if (att.subjectWiseStats && att.subjectWiseStats.length > 0) {
    const subjStr = att.subjectWiseStats
      .map(s => `${s.subject}: ${s.percentage}% (${s.present + (s.onDuty || 0)}/${s.total} attended, ${s.status})`)
      .join(' | ');
    lines.push(`• Subject-Wise Attendance: ${subjStr}`);
  }

  // 3. Enrolled Courses & Assigned Faculty
  if (courses.length > 0) {
    lines.push('\n=== ENROLLED COURSES ===');
    courses.forEach((c, idx) => {
      lines.push(`• Course ${idx + 1}: ${c.name} (${c.code}) — Credits: ${c.credits || 3}, Faculty: ${c.faculty || 'Assigned Faculty'}`);
    });
  }

  // 4. Academic Marks & Exam Grades
  if (marks.length > 0) {
    lines.push('\n=== MARKS & GRADES ===');
    marks.forEach(m => {
      lines.push(`• ${m.courseName} (${m.courseCode}): Total ${m.total}/100 [Grade: ${m.grade}] (Semester Exam: ${m.semesterExam}/60, Internal/Assignment: ${m.assignmentScore}/20, Practical: ${m.practicalScore}/20)`);
    });
  } else {
    lines.push('\n=== MARKS & GRADES ===\n• Marks: No published marks recorded yet.');
  }

  // 5. Assignments (Pending & Completed)
  lines.push('\n=== ASSIGNMENTS & COURSEWORK ===');
  if (pending.length > 0) {
    lines.push(`• Pending Assignments (${pending.length}): ` + pending.map(p => `"${p.title}" for ${p.courseName} (Due: ${p.dueDate}, Faculty: ${p.faculty || 'Faculty'})`).join('; '));
  } else {
    lines.push('• Pending Assignments: None (All completed/up to date!)');
  }
  if (completed.length > 0) {
    lines.push(`• Completed Submissions (${completed.length}): ` + completed.slice(0, 5).map(c => `"${c.title}" for ${c.courseName}`).join('; '));
  }

  // 6. Digital Twin, Trajectory & Improvement Advice
  if (twin.velocityTrajectory) {
    lines.push('\n=== ACADEMIC VELOCITY & DIGITAL TWIN ===');
    lines.push(`• Attendance Velocity: ${twin.velocityTrajectory} | 30-Day Projection: ${twin.projected30DayAttendance}% | Academic Risk Level: ${twin.riskLevel}`);
    if (twin.recommendedImprovements && twin.recommendedImprovements.length > 0) {
      lines.push(`• Suggested Improvements: ${twin.recommendedImprovements.slice(0, 3).join(' | ')}`);
    }
  }

  return lines.join('\n');
}

let cachedBestModel = null;
let lastModelCheckTime = 0;

/**
 * Automatically discovers the best available local LLM from Ollama.
 * Prioritizes high-parameter and modern reasoning models first, with phi3 fallback.
 */
async function getBestOllamaModel() {
  if (process.env.OLLAMA_MODEL) {
    return process.env.OLLAMA_MODEL;
  }
  const now = Date.now();
  if (cachedBestModel && (now - lastModelCheckTime < 60000)) {
    return cachedBestModel;
  }

  const ollamaTagsUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate').replace(/\/api\/generate\/?$/, '/api/tags');
  try {
    const res = await fetch(ollamaTagsUrl, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      const availableModels = (data.models || []).map(m => m.name || m.model || '');
      
      const priorityCandidates = [
        'qwen2.5:14b', 'qwen2.5:7b', 'qwen2.5:latest', 'qwen2.5:3b',
        'llama3.3:latest', 'llama3.3:70b',
        'llama3.1:8b', 'llama3.1:latest',
        'llama3.2:3b', 'llama3.2:latest', 'llama3.2:1b',
        'mistral:7b', 'mistral:latest',
        'gemma2:9b', 'gemma2:2b',
        'phi3:latest', 'phi3'
      ];

      for (const pref of priorityCandidates) {
        const matched = availableModels.find(m => m === pref || m.startsWith(pref.split(':')[0] + ':') || m === pref.split(':')[0]);
        if (matched) {
          cachedBestModel = matched;
          lastModelCheckTime = now;
          return cachedBestModel;
        }
      }

      if (availableModels.length > 0) {
        cachedBestModel = availableModels[0];
        lastModelCheckTime = now;
        return cachedBestModel;
      }
    }
  } catch (_) {}

  return 'phi3:latest';
}

/**
 * Query Local Offline LLM (e.g. Ollama http://127.0.0.1:11434) Grounded in Real-Time ERP Records
 * Upgraded to 16K context window, 28,000 char document capacity, Vector RAG injection, and full prompt guardrails.
 * @param {string} prompt - The student's question
 * @param {object} context - Real-time ERP data (attendance, marks, etc.)
 * @param {string} attachedFileText - Full text content of any uploaded file (syllabus, notes, etc.)
 * @param {string} attachedFileName - Original filename of the uploaded file
 * @param {string} knowledgeContextText - RAG retrieved institutional policies & custom regulations
 * @param {number} requestedCount - Exact count of questions if quiz requested
 */
async function queryOfflineLlm(prompt, context = {}, attachedFileText = '', attachedFileName = '', knowledgeContextText = '', requestedCount = 5) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
  const ollamaModel = await getBestOllamaModel();

  const isQuizRequest = /quize?s?|mcqs?|questions?|practice|test me|test my|problems?|exam|mcq/i.test(prompt);
  const portalContext = buildFullStudentPortalContext(context);

  let systemPrompt;
  let mode;

  console.log(`[Ollama] Model: ${ollamaModel} | File text: ${attachedFileText.length} chars | isQuiz: ${isQuizRequest} | prompt: "${prompt.substring(0, 50)}"`);

  // Parse requested question count
  const countMatch = prompt.match(/(\d+)\s*(?:questions?|mcqs?|quize?s?)/i) || prompt.match(/(?:give|generate|create|ask|test)\s*(?:me|my)?\s*(\d+)/i);
  const count = countMatch ? Math.min(25, Math.max(1, parseInt(countMatch[1], 10))) : Math.min(25, Math.max(1, Number(requestedCount) || 5));

  // Allow up to 28,000 characters of attached file content (fitting 16K context window)
  const slicedFileText = attachedFileText ? attachedFileText.substring(0, 28000) : '';

  if (slicedFileText && slicedFileText.trim().length > 20 && isQuizRequest) {
    mode = 'QUIZ_FROM_DOCUMENT';
    systemPrompt =
      `You are Student AI, an expert academic professor and quiz creator for a college student.
The student uploaded their course syllabus document ("${attachedFileName || 'Syllabus'}") and asked: "${prompt}".

==================================================
[ATTACHED SYLLABUS / DOCUMENT CONTENT]
${slicedFileText}
==================================================

Generate EXACTLY ${count} high-quality, distinct multiple-choice questions (MCQs) covering the units and topics from the document above.
Make sure the questions cover distinct units and core concepts as found in the text.

FORMAT each question clearly as:
**Q[N]: [Question text - specify Unit/Topic]**
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
👉 **Correct Answer:** [Option Letter]
*Explanation:* [Concise concept explanation]

Generate the ${count} questions now (plain text, NO JSON):`;

  } else if (isQuizRequest) {
    mode = 'QUIZ_FROM_COURSES';
    const courseNames = (context.courses || []).map(c => c.name).filter(Boolean);
    const courseList = courseNames.length > 0
      ? courseNames.join(', ')
      : 'the student\'s enrolled courses';

    systemPrompt =
      `You are Student AI, an expert academic tutor and quiz creator.
The student asked: "${prompt}".
They have not attached a syllabus document, so generate questions based on their enrolled courses: ${courseList}

Generate EXACTLY ${count} multiple-choice practice questions (MCQs) covering foundational topics of the courses.
CRITICAL: Do NOT say "no quizzes recorded". You MUST generate the questions now.

Student's Portal Context:
${portalContext}

FORMAT each question clearly as:
**Q[N]: [Question text — specify subject/topic]**
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
👉 **Correct Answer:** [Option Letter]
*Explanation:* [Concise concept explanation]

Generate the ${count} questions now (plain text, NO JSON):`;

  } else if (slicedFileText && slicedFileText.trim().length > 20) {
    mode = 'DOCUMENT_PLUS_PORTAL';
    systemPrompt =
      `You are Student AI, the intelligent Academic Assistant for the logged-in student.
Answer the student's question accurately using their Student Portal Records, Institutional Regulations, and the uploaded document below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "According to the database...". Speak directly to the student.
2. CONCISE BY DEFAULT: Unless the user explicitly asks for "in detail", output a direct, crisp 1-2 sentence answer.
3. 2-DECIMAL ACCURACY: Format all percentages with 2 decimals (e.g. 84.50%).
4. Do NOT output raw JSON.

==================================================
[1. STUDENT PORTAL RECORDS]
${portalContext}
==================================================

${knowledgeContextText ? `==================================================\n[2. INSTITUTIONAL POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
==================================================
[3. ATTACHED FILE: "${attachedFileName || 'Uploaded Document'}"]
${slicedFileText}
==================================================

Student Question: "${prompt}"

Answer:`;

  } else {
    mode = 'PORTAL_RECORDS';
    systemPrompt =
      `You are Student AI, the intelligent Academic Assistant for the logged-in student.
Answer the student's question accurately using their personal portal records and institutional regulations below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "In the database...". Speak directly to the student.
2. CONCISE BY DEFAULT: Unless the user explicitly asks for "in detail" or "breakdown", output ONLY the direct 1-2 sentence answer.
3. STRICT CATEGORY SCOPING:
   - If asked for attendance, give only attendance.
   - If asked for marks, give only marks.
   - If asked for roll number, CGPA, or email, give only that info.
4. 2-DECIMAL ACCURACY: Format all percentages with 2 decimals (e.g. 66.67%, 82.35%).
5. FORECAST & DIGITAL TWIN: If asked about future attendance, velocity, or 30-day projection, use the Academic Velocity & Digital Twin section.
6. IMPROVEMENT ADVICE: If asked "how to improve" or "how to reach 75%", provide concrete, actionable steps.
7. OMNISCIENT WHAT-IF & HYPOTHETICAL SIMULATIONS (ALL ACADEMIC DOMAINS):
   - ATTENDANCE WHAT-IF:
     * If missing/bunking N classes: New Total = Total + N, Present stays same -> Projected % = (Present / New Total) * 100.
     * If attending N consecutive classes: New Total = Total + N, New Present = Present + N -> Projected % = (New Present / New Total) * 100.
     * State exact 2-decimal percentage and whether Safe (>=75%) or Shortage (<75%).
   - MARKS & EXAMS WHAT-IF:
     * If asked "What if I score X in semester exam?" or "What if I get Y in internal/assignments?":
     * Evaluation Scheme: Semester Exam (out of 60) + Internal/Assignment (out of 20) + Practical (out of 20) = Total (out of 100).
     * Compute the new Total /100 and determine the projected Letter Grade (O: >=90, A+: 80-89, A: 70-79, B+: 60-69, B: 50-59, RA/Fail: <50).
   - CGPA & GPA WHAT-IF:
     * If asked "What if I get all A's?" or "What if my SGPA is X, what will my CGPA be?":
     * Project the updated CGPA based on course credits and current CGPA.
   - ASSIGNMENTS & DEADLINES WHAT-IF:
     * If asked "What if I don't submit Assignment N?" or "What if I submit after the deadline?":
     * Explain the impact on internal assignment marks (out of 20) and risk of falling below the 50% passing threshold.
8. Do NOT output raw JSON.

==================================================
[STUDENT PORTAL RECORDS]
${portalContext}
==================================================
${knowledgeContextText ? `\n==================================================\n[INSTITUTIONAL POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
Student Question: "${prompt}"

Answer:`;
  }

  console.log(`[Ollama] Using mode: ${mode}`);

  try {
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_ctx: 16384,
          num_predict: 1500
        }
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (res.ok) {
      const data = await res.json();
      let text = data.response?.trim();
      if (text && text.length > 2) {
        text = cleanOllamaResponse(text);
        return {
          reply: text,
          model: `Local Offline LLM (${ollamaModel}) + High-Context Engine`
        };
      }
    }
  } catch (err) {
    console.warn('[Ollama] Query failed or timed out:', err.message);
  }
  return null;
}

/**
 * Build comprehensive Admin portal context for local offline LLM
 */
function buildFullAdminPortalContext(context) {
  if (!context || Object.keys(context).length === 0) return 'No administrative portal records available.';

  const overview = context.institutionOverview || {};
  const depts = context.departments || [];
  const faculty = context.facultyRoster || [];
  const students = context.studentRoster || [];
  const courses = context.courses || [];
  const assignments = context.assignments || [];
  const twin = context.nexusMindIntelligence || {};

  const lines = [];

  // 1. Institution Overview
  lines.push('=== INSTITUTION OVERVIEW ===');
  lines.push(`• Total Students: ${overview.totalStudents || students.length} | Total Faculty: ${overview.totalFaculty || faculty.length}`);
  lines.push(`• Departments: ${overview.totalDepartments || depts.length} | Courses: ${overview.totalCourses || courses.length} | Assignments: ${overview.totalAssignments || assignments.length}`);
  lines.push(`• Campus-Wide Student Attendance: ${overview.overallStudentAttendancePercentage || 0}%`);
  lines.push(`• Students Facing Attendance Shortage (<75%): ${overview.studentsWithAttendanceShortageCount || 0}`);

  // 2. Departments
  if (depts.length > 0) {
    lines.push('\n=== DEPARTMENTS ===');
    depts.forEach(d => {
      lines.push(`• ${d.name} (${d.code}) — HOD: ${d.hod || 'N/A'}, Students: ${d.studentCount || 0}, Faculty: ${d.facultyCount || 0}, Courses: ${d.coursesCount || 0}`);
    });
  }

  // 3. Faculty Highlights
  if (faculty.length > 0) {
    lines.push('\n=== FACULTY DIRECTORY ===');
    faculty.slice(0, 15).forEach(f => {
      lines.push(`• ${f.name} (ID: ${f.facultyId || f.employeeId || 'N/A'}) — Dept: ${f.department || 'General'}, Desig: ${f.designation || 'Faculty'}, Phone: ${f.phone || 'N/A'}, Email: ${f.email || 'N/A'}`);
    });
    if (faculty.length > 15) lines.push(`• ...and ${faculty.length - 15} more faculty members.`);
  }

  // 4. Students Facing Attendance Shortage
  const shortageStudents = (overview.studentsWithAttendanceShortage || []).slice(0, 10);
  if (shortageStudents.length > 0) {
    lines.push('\n=== STUDENTS AT RISK (ATTENDANCE SHORTAGE) ===');
    shortageStudents.forEach(s => {
      lines.push(`• ${s.name} (Roll: ${s.rollNo || 'N/A'}, Dept: ${s.department || 'N/A'}): ${s.percentage}% Attendance`);
    });
  }

  // 5. Assignments Overview
  if (assignments.length > 0) {
    lines.push('\n=== ACADEMIC ASSIGNMENTS ===');
    assignments.slice(0, 8).forEach(a => {
      lines.push(`• "${a.title}" (${a.courseName}) — Due: ${a.dueDate}, Submitted: ${a.submittedCount}/${a.totalEligible || 'N/A'}, Pending: ${a.pendingCount}`);
    });
  }

  // 6. Institutional Velocity & Digital Twin
  if (twin.institutionalVelocity) {
    lines.push('\n=== INSTITUTIONAL DIGITAL TWIN & PREDICTIONS ===');
    lines.push(`• Campus Velocity: ${twin.institutionalVelocity} | 30-Day Attendance Projection: ${twin.projected30DayAttendance}%`);
    lines.push(`• Anomaly Status: ${twin.anomalyStatus || 'NOMINAL'}`);
    if (twin.recommendedPolicyActions && twin.recommendedPolicyActions.length > 0) {
      lines.push(`• Strategic Recommendations: ${twin.recommendedPolicyActions.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Query Local Offline LLM for Super Admin AI grounded in institution records
 * Upgraded to 16K context window, 28,000 char document capacity, Vector RAG injection, and full prompt guardrails.
 */
async function queryAdminOfflineLlm(prompt, context = {}, attachedFileText = '', attachedFileName = '', knowledgeContextText = '') {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
  const ollamaModel = await getBestOllamaModel();
  const adminContext = buildFullAdminPortalContext(context);
  const slicedFileText = attachedFileText ? attachedFileText.substring(0, 28000) : '';

  let systemPrompt;
  if (slicedFileText) {
    systemPrompt =
      `You are Super Admin AI, the administrative intelligence executive assistant for a college ERP system.
Answer the administrator's question using the live Institutional ERP Records, college policies, and the attached document below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "According to the database...".
2. DIRECT ANSWERS: If asked for student or faculty details, provide direct contact numbers, email, department, attendance, and CGPA cleanly.
3. DUAL & MULTI-ENTITY: If asked about both a student and faculty member, clearly provide separate structured sections for each.
4. CONCISE BY DEFAULT: Provide crisp, direct answers unless explicitly asked for "in detail" or "breakdown".
5. 2-DECIMAL ACCURACY: Format all attendance percentages with 2 decimals (e.g. 66.67%).
6. Do NOT output raw JSON.

==================================================
[1. LIVE INSTITUTIONAL RECORDS]
${adminContext}
==================================================

${knowledgeContextText ? `==================================================\n[2. INSTITUTIONAL POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
==================================================
[3. ATTACHED DOCUMENT: "${attachedFileName || 'Uploaded File'}"]
${slicedFileText}
==================================================

Admin Question: "${prompt}"

Answer:`;
  } else {
    systemPrompt =
      `You are Super Admin AI, the administrative executive assistant for a college ERP system.
Answer the administrator's question accurately using their live campus database records and institutional regulations below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "In the database...". Speak directly to the administrator.
2. DIRECT ANSWERS: If asked for student or faculty details, provide direct contact numbers, email, department, attendance %, and CGPA cleanly.
3. DUAL & MULTI-ENTITY: If asked about both student and faculty, provide structured sections for both.
4. CONCISE BY DEFAULT: Unless the user asks for "in detail" or "breakdown", output ONLY the direct, crisp answer.
5. 2-DECIMAL ACCURACY: Format all percentages with 2 decimals (e.g. 66.67%, 82.35%).
6. INSTITUTIONAL DIGITAL TWIN & ANOMALIES: If asked about campus attendance velocity, health ratings, or anomalies, refer directly to institutional velocity metrics.
7. OMNISCIENT WHAT-IF POLICY & INSTITUTIONAL SIMULATIONS (ALL DOMAINS):
   - POLICY & ATTENDANCE THRESHOLDS: If asked "What if we relax attendance to 70% or 65%?" or "What if 3 unplanned holidays occur?": calculate the exact number of students retained/saved from examination debarment across departments.
   - FACULTY ALLOCATION & WORKLOAD: If asked "What if we assign N more faculty to Department X?" or "What if student intake increases by N?": evaluate teacher-student ratios, course coverage, and department health ratings.
   - ACADEMIC PERFORMANCE & RETENTION: If asked "What if remedial tutoring is mandated for at-risk students?" or "What if fee payment deadlines are extended?": project institutional pass rate shifts and cohort retention metrics.
8. Do NOT output raw JSON.

==================================================
[LIVE INSTITUTIONAL RECORDS]
${adminContext}
==================================================
${knowledgeContextText ? `\n==================================================\n[INSTITUTIONAL POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
Admin Question: "${prompt}"

Answer:`;
  }

  console.log(`[Ollama Admin] Model: ${ollamaModel} | Prompt: "${prompt.substring(0, 50)}"`);

  try {
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_ctx: 16384,
          num_predict: 1500
        }
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (res.ok) {
      const data = await res.json();
      let text = data.response?.trim();
      if (text && text.length > 2) {
        text = cleanOllamaResponse(text);
        return {
          reply: text,
          model: `Local Offline LLM (${ollamaModel}) + High-Context Engine`
        };
      }
    }
  } catch (err) {
    console.warn('[Ollama Admin] Query failed or timed out:', err.message);
  }
  return null;
}

/**
 * Build comprehensive Faculty portal context for local offline LLM
 */
function buildFullFacultyPortalContext(context) {
  if (!context || Object.keys(context).length === 0) return 'No faculty portal records available.';

  const info = context.facultyInfo || {};
  const courses = context.coursesTaught || [];
  const students = context.studentRoster || [];
  const assignments = context.assignments || [];
  const subjAtt = context.subjectAttendanceSummary || [];
  const twin = context.nexusMindIntelligence || {};
  const personalAtt = context.facultyPersonalAttendance || {};

  const lines = [];

  // 1. Faculty Profile
  lines.push('=== FACULTY PROFILE ===');
  lines.push(`• Name: ${info.name || 'Faculty Member'} (Faculty ID: ${info.facultyId || info.employeeId || 'N/A'})`);
  lines.push(`• Department: ${info.department || 'General'} | Designation: ${info.designation || 'Faculty'}`);
  if (info.email) lines.push(`• Email: ${info.email}`);
  if (info.phone) lines.push(`• Contact Phone: ${info.phone}`);
  lines.push(`• Total Students Taught: ${context.totalStudentsUnderFaculty || students.length}`);

  // 2. Courses Taught
  if (courses.length > 0) {
    lines.push('\n=== ASSIGNED COURSES ===');
    courses.forEach(c => {
      lines.push(`• ${c.name} (${c.code}) — Semester ${c.semester || 'All'}, Section ${c.section || 'All'}, Credits: ${c.credits || 3}, Enrolled: ${c.enrolledStudentsCount || 0} students`);
    });
  }

  // 3. Class Attendance by Subject
  if (subjAtt.length > 0) {
    lines.push('\n=== SUBJECT ATTENDANCE RATES ===');
    subjAtt.forEach(s => {
      lines.push(`• ${s.subject}: Overall ${s.overallPercentage}% (Classes: ${s.totalClasses}, Students Safe: ${s.studentsAbove75 || 0}, At Shortage: ${s.studentsBelow75 || 0})`);
    });
  }

  // 4. Assignments & Submissions
  if (assignments.length > 0) {
    lines.push('\n=== ASSIGNMENTS CREATED ===');
    assignments.slice(0, 8).forEach(a => {
      lines.push(`• "${a.title}" (${a.courseName}) — Due: ${a.dueDate}, Submitted: ${a.submittedCount}, Pending: ${a.pendingCount}`);
    });
  }

  // 5. At-Risk Students under Faculty
  const atRisk = (twin.atRiskStudents || students.filter(s => s.attendance?.percentage < 75)).slice(0, 10);
  if (atRisk.length > 0) {
    lines.push('\n=== AT-RISK STUDENTS (<75% ATTENDANCE / LOW MARKS) ===');
    atRisk.forEach(s => {
      lines.push(`• ${s.name} (Roll: ${s.rollNo || 'N/A'}): ${s.attendance?.percentage || s.percentage || 0}% Attendance, CGPA: ${s.cgpa || 'N/A'}`);
    });
  }

  // 6. Faculty Personal Attendance & Class Velocity
  if (personalAtt.totalClasses > 0) {
    lines.push('\n=== FACULTY TEACHING SESSIONS ===');
    lines.push(`• Classes Conducted: ${personalAtt.presentClasses || 0}/${personalAtt.totalClasses || 0} (${personalAtt.overallPercentage}%) — Status: ${personalAtt.status}`);
  }

  if (twin.classVelocity) {
    lines.push('\n=== CLASS INTELLIGENCE & DIGITAL TWIN ===');
    lines.push(`• Class Velocity: ${twin.classVelocity} | Predicted Pass Rate: ${twin.passRate || 0}%`);
    if (twin.recommendedInterventions && twin.recommendedInterventions.length > 0) {
      lines.push(`• Actionable Teaching Recommendations: ${twin.recommendedInterventions.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Query Local Offline LLM for Faculty AI grounded in class and course records
 * Upgraded to 16K context window, 28,000 char document capacity, Vector RAG injection, and full prompt guardrails.
 */
async function queryFacultyOfflineLlm(prompt, context = {}, attachedFileText = '', attachedFileName = '', knowledgeContextText = '') {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
  const ollamaModel = await getBestOllamaModel();
  const facultyContext = buildFullFacultyPortalContext(context);
  const slicedFileText = attachedFileText ? attachedFileText.substring(0, 28000) : '';

  let systemPrompt;
  if (slicedFileText) {
    systemPrompt =
      `You are Faculty AI, the dedicated teaching and course management co-pilot for the logged-in faculty member.
Answer the instructor's question using their class ERP records, academic policies, and the attached file below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "According to the database...". Speak directly as an intelligent faculty assistant.
2. CONCISE BY DEFAULT: Output a direct, crisp 1-2 sentence answer unless explicitly asked for "in detail" or "breakdown".
3. 2-DECIMAL ACCURACY: Format all percentages with 2 decimals (e.g. 66.67%).
4. Do NOT output raw JSON.

==================================================
[1. CLASS & FACULTY RECORDS]
${facultyContext}
==================================================

${knowledgeContextText ? `==================================================\n[2. ACADEMIC POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
==================================================
[3. ATTACHED DOCUMENT: "${attachedFileName || 'Uploaded File'}"]
${slicedFileText}
==================================================

Faculty Question: "${prompt}"

Answer:`;
  } else {
    systemPrompt =
      `You are Faculty AI, the dedicated teaching and course management co-pilot for the logged-in faculty member.
Answer the instructor's question accurately using their live class records and academic regulations below.

[CRITICAL INSTRUCTIONS]:
1. NATURAL TONE: Never use phrases like "The database contains..." or "In the database...". Speak directly to the instructor.
2. CONCISE BY DEFAULT: Unless the user asks for "in detail" or "breakdown", output ONLY the direct 1-2 sentence answer.
3. STRICT CATEGORY SCOPING:
   - If asked for student attendance, give only that student's attendance.
   - If asked for assignment status, give only assignment status.
4. 2-DECIMAL ACCURACY: Format all percentages with 2 decimals (e.g. 66.67%, 82.35%).
5. CLASS VELOCITY & AT-RISK STUDENTS: If asked about pass rates, class predictions, or at-risk students, refer to Class Intelligence & Digital Twin. Conclude with actionable teaching interventions.
6. OMNISCIENT WHAT-IF & CLASSROOM SIMULATIONS (ALL DOMAINS):
   - REMEDIAL SESSIONS & ATTENDANCE: If asked "What if I conduct N remedial classes?", calculate how many at-risk students (<75%) get recovered back above 75%.
   - MARKS & CLASS PASS RATES: If asked "What if the class average in internal exam increases by N marks?" or "What if failing students score 40/60 in semester exam?": calculate the projected class pass rate % and shift in grade distribution.
   - ASSIGNMENT DEADLINES & SUBMISSIONS: If asked "What if I extend the deadline by N days?" or "What if late submissions are accepted?": analyze expected submission recovery from the pending assignments roster.
7. Do NOT output raw JSON.

==================================================
[CLASS & FACULTY RECORDS]
${facultyContext}
==================================================
${knowledgeContextText ? `\n==================================================\n[ACADEMIC POLICIES & REGULATIONS]\n${knowledgeContextText}\n==================================================\n` : ''}
Faculty Question: "${prompt}"

Answer:`;
  }

  console.log(`[Ollama Faculty] Model: ${ollamaModel} | Prompt: "${prompt.substring(0, 50)}"`);

  try {
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_ctx: 16384,
          num_predict: 1500
        }
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (res.ok) {
      const data = await res.json();
      let text = data.response?.trim();
      if (text && text.length > 2) {
        text = cleanOllamaResponse(text);
        return {
          reply: text,
          model: `Local Offline LLM (${ollamaModel}) + High-Context Engine`
        };
      }
    }
  } catch (err) {
    console.warn('[Ollama Faculty] Query failed or timed out:', err.message);
  }
  return null;
}

/**
 * Extract text from a scanned/image-based PDF via Python ML OCR service
 * @param {Buffer} pdfBuffer - The raw PDF buffer
 * @returns {string} Extracted text or empty string
 */
async function extractPdfTextOcr(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) return '';
  try {
    const pdfBase64 = pdfBuffer.toString('base64');
    const result = await postToMl('/api/ml/ocr-pdf', { pdfBase64 }, 30000);  // 30s for OCR
    if (result && result.text && result.chars > 20) {
      console.log(`[OCR] Extracted ${result.chars} chars via ${result.method} from ${result.pages} pages`);
      return result.text;
    }
  } catch (err) {
    console.log('[OCR] Python ML OCR call failed:', err.message);
  }
  return '';
}

/**
 * SnapClass AI Biometric: Extract 128-d face embedding from image
 */
async function extractFaceEmbedding(imageBase64) {
  const result = await postToMl('/api/ml/face-extract', { image: imageBase64 }, 10000);
  return result;
}

/**
 * SnapClass AI Biometric: Match classroom photo against student embeddings
 */
async function matchClassPhotoFaces(imageBase64, candidates = [], threshold = 0.35) {
  const result = await postToMl('/api/ml/face-match', {
    image: imageBase64,
    candidates,
    threshold
  }, 30000);
  return result;
}

/**
 * SnapClass AI Biometric: Extract voice signature
 */
async function extractVoiceSignature(audioBase64) {
  const result = await postToMl('/api/ml/voice-extract', { audio: audioBase64 }, 8000);
  return result;
}

/**
 * SnapClass AI Biometric: Match voice roll-call against candidates
 */
async function matchVoiceRollCall(audioBase64, candidates = [], threshold = 0.55) {
  const result = await postToMl('/api/ml/voice-match', {
    audio: audioBase64,
    candidates,
    threshold
  }, 8000);
  return result;
}

module.exports = {
  detectAnomalies,
  calculateForecast,
  evaluateRiskScore,
  runSimulation,
  prioritizeInterventions,
  generateQuiz,
  queryOfflineLlm,
  queryAdminOfflineLlm,
  queryFacultyOfflineLlm,
  extractPdfTextOcr,
  extractFaceEmbedding,
  matchClassPhotoFaces,
  extractVoiceSignature,
  matchVoiceRollCall
};



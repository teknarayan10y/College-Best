const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Deterministic local embedding fallback generator (128-dimensional normalized vector)
 * Ensures vector search works even when GEMINI_API_KEY is not provided or offline.
 */
function generateLocalEmbedding(text) {
  const DIMENSIONS = 128;
  const vector = new Array(DIMENSIONS).fill(0);
  if (!text || typeof text !== 'string') return vector;

  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0; // Convert to 32bit integer
    }
    const index = Math.abs(hash) % DIMENSIONS;
    vector[index] += 1;
    // Cross-term bi-gram feature
    if (i < words.length - 1) {
      const nextWord = words[i + 1];
      let biHash = 0;
      for (let c = 0; c < nextWord.length; c++) {
        biHash = (biHash << 5) - biHash + nextWord.charCodeAt(c);
        biHash |= 0;
      }
      const biIndex = Math.abs(hash ^ biHash) % DIMENSIONS;
      vector[biIndex] += 0.5;
    }
  }

  // L2 Normalization
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}

/**
 * Generate embedding using Google Gemini text-embedding-004, with automatic local Ollama neural embedding
 * (e.g. nomic-embed-text / all-minilm) and normalized deterministic word-hash fallback.
 */
async function generateEmbedding(text) {
  // 1. Try Google Gemini text-embedding-004 if online and key present
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      if (result && result.embedding && result.embedding.values) {
        return result.embedding.values;
      }
    } catch {
      // Fall through to local embedding
    }
  }

  // 2. Try Local Offline Ollama Neural Embedding
  try {
    const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate').replace(/\/api\/generate\/?$/, '/api/embeddings');
    const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embedModel,
        prompt: text
      }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    }
  } catch (_) {
    // Fall through to local mathematical embedding
  }

  // 3. Mathematical deterministic 128-dimensional normalized embedding fallback
  return generateLocalEmbedding(text);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory cache of embedded institutional documents
 */
let cachedDefaultEmbeddings = null;

async function getDefaultEmbeddings() {
  if (!cachedDefaultEmbeddings) {
    cachedDefaultEmbeddings = await Promise.all(DEFAULT_KNOWLEDGE_DOCS.map(async (doc) => {
      const textToEmbed = `${doc.title}\n${(doc.tags || []).join(' ')}\n${doc.content}`;
      const embedding = await generateEmbedding(textToEmbed);
      return { ...doc, embedding };
    }));
  }
  return cachedDefaultEmbeddings;
}

/**
 * Vector Search: Retrieve Top-K knowledge documents for a query
 * Searches institutional documents in-memory.
 * @param {string} query
 * @param {number} topK
 * @param {number} threshold
 */
async function searchKnowledgeBase(query, topK = 3, threshold = 0.15) {
  try {
    const queryVector = await generateEmbedding(query);
    const docs = await getDefaultEmbeddings();

    const scored = docs.map((doc) => {
      let score = 0;
      if (doc.embedding && doc.embedding.length === queryVector.length) {
        score = cosineSimilarity(queryVector, doc.embedding);
      } else {
        const qWords = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
        const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(' ')}`.toLowerCase();
        let matchCount = 0;
        for (const w of qWords) {
          if (w.length > 2 && text.includes(w)) matchCount++;
        }
        score = qWords.length > 0 ? matchCount / qWords.length : 0;
      }
      return {
        id: doc.title,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        metadata: { author: 'Institution' },
        scope: 'institution',
        sourceFile: '',
        similarityScore: Math.round(score * 1000) / 1000
      };
    });

    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    return scored.filter((c) => c.similarityScore >= threshold).slice(0, topK);
  } catch (err) {
    console.error('[RAG Service] Search error:', err.message);
    return [];
  }
}

/**
 * Institutional Seed Knowledge Base
 */
const DEFAULT_KNOWLEDGE_DOCS = [
  {
    title: 'Attendance Regulations & Minimum Requirements',
    category: 'ATTENDANCE',
    tags: ['attendance', 'percentage', 'condonation', 'medical', 'safe to miss', '75 percent', 'shortage'],
    content: `College Academic Regulations mandate a minimum of 75% overall attendance in each registered course to be eligible for End-Semester University Examinations.
- Safe Range (>= 75%): Fully eligible to appear for regular semester examinations and hall ticket generation.
- Condonation Range (65% to 74%): Attendance shortage may be condoned by the Dean/Principal on valid medical grounds or approved On-Duty (OD) official college representation, subject to payment of the prescribed condonation fee and submission of approved medical/OD certificates within 3 days.
- Detention Range (< 65%): Students with less than 65% aggregate attendance will not be permitted to appear for the end-semester exams and must repeat the course during subsequent summer/regular semesters.`
  },
  {
    title: 'Examination Weightage & Evaluation Scheme',
    category: 'EXAM',
    tags: ['exam', 'weightage', 'internal', 'practical', 'assignment', 'semester exam', 'marks breakdown'],
    content: `The comprehensive student evaluation per course is calculated out of 100 Total Marks with the following split:
- End Semester University Examination: Maximum 60 Marks.
- Continuous Internal Assessment (Assignment Score): Maximum 20 Marks (Assessing homework, submissions, and class tutorials).
- Continuous Practical / Lab / Quiz Assessment: Maximum 20 Marks.
Total Course Mark = Semester Exam (60) + Assignment (20) + Practical (20) = 100 Marks.
Passing Minimum: A student must secure a minimum of 50% in aggregate (minimum 50 out of 100) and at least 45% in the End Semester Exam to be declared as passed.`
  },
  {
    title: 'Grading Scale & SGPA / CGPA Calculation System',
    category: 'GRADING',
    tags: ['grade', 'cgpa', 'sgpa', 'gpa', 'grading scale', 'points', 'letter grade', 'O grade', 'arrear'],
    content: `Academic performance is awarded on a 10-Point Letter Grading Scale:
- Grade 'O' (Outstanding): 95 - 100 Marks (Grade Points: 10.0)
- Grade 'A+' (Excellent): 90 - 94 Marks (Grade Points: 9.0)
- Grade 'A' (Very Good): 80 - 89 Marks (Grade Points: 8.0)
- Grade 'B+' (Good): 70 - 79 Marks (Grade Points: 7.0)
- Grade 'B' (Above Average): 60 - 69 Marks (Grade Points: 6.0)
- Grade 'C' (Pass): 50 - 59 Marks (Grade Points: 5.0)
- Grade 'F' (Fail / Re-appear): Below 50 Marks (Grade Points: 0.0)
SGPA = Sum(Course Credits * Grade Points) / Sum(Course Credits).
CGPA is the cumulative credit-weighted average of all completed semesters.`
  },
  {
    title: 'Degree Program Structure & Total Semesters',
    category: 'REGULATION',
    tags: ['program', 'semester', 'total semester', 'duration', 'btech', 'be', 'bca', 'mtech', 'mca', 'mba'],
    content: `Standard Degree Program Durations:
- B.Tech / B.E. (Bachelor of Technology / Engineering): 4 Academic Years, divided into 8 Semesters.
- B.C.A. / B.Sc. / B.B.A. (Undergraduate Science & Applications): 3 Academic Years, divided into 6 Semesters.
- M.Tech / M.E. / M.C.A. / M.B.A. (Postgraduate Programs): 2 Academic Years, divided into 4 Semesters.
Each academic year consists of two terms: Odd Semester (July to December) and Even Semester (January to June).`
  },
  {
    title: 'Assignment Submission & Late Policy Guidelines',
    category: 'REGULATION',
    tags: ['assignment', 'submission', 'due date', 'late submission', 'portal', 'upload'],
    content: `Assignment deliverables must be submitted directly through the Smart ERP Student Portal before the specified due date.
- Supported file attachments include PDF, DOCX, ZIP, PNG, and JPG up to 10MB per file.
- Submissions after the deadline will be marked as late and may attract a deduction of up to 20% marks per day of delay unless prior approval was obtained from the course faculty.
- Once submitted, students can review their submission timestamp and notes under their Assignment Dashboard.`
  },
  {
    title: 'On-Duty (OD) & Leave Application Procedures',
    category: 'ATTENDANCE',
    tags: ['on duty', 'od', 'leave', 'permission', 'sports', 'symposium', 'hackathon'],
    content: `On-Duty (OD) attendance credit is granted to students participating in authorized extracurricular events, sports tournaments, technical hackathons, symposiums, and placement drives.
- The OD request must be endorsed by the Faculty In-Charge and Head of the Department (HOD) prior to the event.
- Approved OD sessions count positively towards attendance percentage calculations as effective present sessions.`
  }
];

/**
 * Pre-warm institutional documents with vector embeddings in memory
 */
async function seedKnowledgeBase() {
  try {
    await getDefaultEmbeddings();
  } catch (err) {
    console.error('[RAG Service] Pre-warm error:', err.message);
  }
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  searchKnowledgeBase,
  seedKnowledgeBase,
  DEFAULT_KNOWLEDGE_DOCS
};

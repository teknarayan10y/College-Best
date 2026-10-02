// Server/services/fileParser.js
// Universal file text extractor — supports any file type a student might upload.
// Binary formats (PDF, DOCX, PPTX, XLSX, images, RTF) are extracted via the Python ML sidecar.
// Light-weight text formats (CSV, JSON, TXT, MD) are handled directly in Node.
const path = require("path");
const http = require("http");

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight Node-side parsers (no external deps beyond what is already used)
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvToText(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return csvText;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return headers.map((h, i) => h + ": " + (vals[i] || "")).join(" | ");
  });
  return [headers.join(" | ")].concat(rows).join("\n");
}

function parseJsonToText(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    function flatten(o, prefix) {
      if (!prefix) prefix = "";
      var result = "";
      if (Array.isArray(o)) {
        o.forEach((item, idx) => { result += flatten(item, prefix + "[" + idx + "]"); });
      } else if (o && typeof o === "object") {
        Object.entries(o).forEach(([k, v]) => { result += flatten(v, prefix ? prefix + "." + k : k); });
      } else {
        result += prefix + ": " + o + "\n";
      }
      return result;
    }
    return flatten(obj);
  } catch (e) { return jsonText; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Python ML sidecar call — used for all binary / rich formats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST to /api/ml/extract-file on the Python sidecar.
 * @param {Buffer} buffer
 * @param {string} filename  Original filename (used to infer extension)
 * @param {string} mimetype  MIME type string
 * @returns {Promise<string>} Extracted text (empty string on failure)
 */
async function extractViaMLSidecar(buffer, filename, mimetype) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      fileBase64: buffer.toString("base64"),
      filename:   filename || "file",
      mimetype:   mimetype || ""
    });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port:     8000,
        path:     "/api/ml/extract-file",
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(postData)
        },
        timeout: 60000
      },
      (res) => {
        let body = "";
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            const text = parsed.text || "";
            if (text) {
              console.log(`[FileParser] ✅ ML sidecar extracted ${text.length} chars from "${filename}" via "${parsed.method}"`);
            }
            resolve(text);
          } catch { resolve(""); }
        });
      }
    );
    req.on("error",   () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.write(postData);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MIME-type helpers
// ─────────────────────────────────────────────────────────────────────────────

function isImageMime(mt) { return mt && mt.startsWith("image/"); }
function isPdfMime(mt)   { return mt === "application/pdf"; }
function isDocMime(mt) {
  return mt && (
    mt.includes("wordprocessingml") ||
    mt.includes("presentationml") ||
    mt.includes("spreadsheetml") ||
    mt === "application/msword" ||
    mt === "application/vnd.ms-excel" ||
    mt === "application/vnd.ms-powerpoint" ||
    mt === "text/rtf" ||
    mt === "application/rtf"
  );
}

const IMAGE_EXTS  = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"]);
const BINARY_EXTS = new Set([".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".rtf", ...IMAGE_EXTS]);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract readable text from any file buffer.
 *
 * Supported formats:
 *  • PDF             — text layer (pdf-parse) + OCR fallback via Python sidecar
 *  • Images          — OCR via Python sidecar (pytesseract)
 *  • Word (.docx)    — python-docx via Python sidecar
 *  • PowerPoint (.pptx) — python-pptx via Python sidecar
 *  • Excel (.xlsx / .xls) — openpyxl via Python sidecar
 *  • RTF             — striprtf via Python sidecar
 *  • CSV             — lightweight Node parser
 *  • JSON            — lightweight Node parser
 *  • TXT / MD / any other plain text — decoded directly
 *
 * @param {Buffer} buffer
 * @param {string} originalname
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
async function extractTextFromFile(buffer, originalname, mimetype) {
  const ext = path.extname(originalname || "").toLowerCase();

  // ── Binary formats: route to Python sidecar ──
  if (BINARY_EXTS.has(ext) || isImageMime(mimetype) || isPdfMime(mimetype) || isDocMime(mimetype)) {
    // For PDFs, try the fast Node-side pdf-parse first before hitting the sidecar
    if (ext === ".pdf" || isPdfMime(mimetype)) {
      try {
        const pdfParse = require("pdf-parse");
        const data = await pdfParse(buffer);
        if (data && data.text && data.text.trim().length > 30) {
          console.log(`[FileParser] ✅ pdf-parse extracted ${data.text.length} chars from "${originalname}"`);
          return data.text;
        }
      } catch (_) { /* fall through to sidecar */ }
    }

    // All other binary types (and scanned PDFs that failed pdf-parse) go to sidecar
    const sidecarText = await extractViaMLSidecar(buffer, originalname, mimetype);
    if (sidecarText) return sidecarText;

    console.warn(`[FileParser] ⚠️  Could not extract text from "${originalname}" — file may be image-only or encrypted.`);
    return "";
  }

  // ── Light-weight plain-text formats handled in Node ──
  const text = buffer.toString("utf-8");
  if (mimetype === "text/csv"       || ext === ".csv")  return parseCsvToText(text);
  if (mimetype === "application/json" || ext === ".json") return parseJsonToText(text);
  // TXT, MD, HTML, XML, etc.
  return text;
}

module.exports = { extractTextFromFile };

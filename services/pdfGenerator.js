// ============================================
// CareerMyntra Exam Portal - Minimal PDF Generator
// ============================================
// No external dependency (no pdfkit/puppeteer). Writes raw PDF syntax
// directly. Supports single/multi-page A4 documents with text (Helvetica /
// Helvetica-Bold, both built into every PDF viewer so nothing needs to be
// embedded), straight lines and filled/stroked rectangles. Good enough for
// simple generated documents like admit cards, receipts, certificates —
// reuse this for any future "download as PDF" feature.
//
// Coordinates: x/y are given from the TOP-LEFT of the page (like CSS),
// which is more intuitive than raw PDF's bottom-left origin — the flip
// happens internally.

const PAGE_WIDTH = 595.28; // A4 portrait, in points
const PAGE_HEIGHT = 841.89;

// Common "smart" punctuation that shows up in admin-entered text (bullets,
// en/em dashes, curly quotes, ellipsis) has no glyph in the base Helvetica
// font under our simple Latin-1 string encoding. Normalize it to a plain
// ASCII look-alike first so it renders instead of falling back to "?".
const UNICODE_ASCII_MAP = {
  '\u2022': '-', // •
  '\u2013': '-', // – en dash
  '\u2014': '-', // — em dash
  '\u2018': "'", // '
  '\u2019': "'", // '
  '\u201C': '"', // "
  '\u201D': '"', // "
  '\u2026': '...', // …
};

// PDF simple strings only support the Latin-1 byte range. Normalize known
// unicode punctuation, then strip anything still outside that range
// (rather than silently corrupting the file), and escape the characters
// that are special inside a "(...)" string.
function esc(text) {
  const normalized = String(text == null ? '' : text).replace(
    /[\u2022\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g,
    (ch) => UNICODE_ASCII_MAP[ch]
  );
  const ascii = normalized.replace(/[^\x00-\xFF]/g, '?');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function hexToRgb01(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16) || 0;
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return [r, g, b].map((v) => Number(v.toFixed(3)));
}

class SimplePDF {
  constructor() {
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.currentOps = [];
    this.pages.push(this.currentOps);
    return this;
  }

  text(x, y, str, { size = 11, bold = false, color = '#111111' } = {}) {
    const [r, g, b] = hexToRgb01(color);
    const font = bold ? '/F2' : '/F1';
    const py = PAGE_HEIGHT - y;
    this.currentOps.push(
      `q ${r} ${g} ${b} rg BT ${font} ${size} Tf ${x.toFixed(2)} ${py.toFixed(2)} Td (${esc(str)}) Tj ET Q`
    );
    return this;
  }

  // Wraps long text across a max width (approximate width based on average
  // glyph size for Helvetica — good enough for body copy, not typesetting).
  wrapText(x, y, str, maxWidth, opts = {}) {
    const size = opts.size || 10;
    const avgCharWidth = size * (opts.bold ? 0.58 : 0.5);
    const maxChars = Math.max(10, Math.floor(maxWidth / avgCharWidth));
    const words = String(str).split(' ');
    let line = '';
    let cy = y;
    const lineHeight = opts.lineHeight || size * 1.45;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > maxChars && line) {
        this.text(x, cy, line, opts);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) this.text(x, cy, line, opts);
    return cy + lineHeight;
  }

  line(x1, y1, x2, y2, { width = 1, color = '#000000' } = {}) {
    const [r, g, b] = hexToRgb01(color);
    const py1 = PAGE_HEIGHT - y1;
    const py2 = PAGE_HEIGHT - y2;
    this.currentOps.push(
      `q ${r} ${g} ${b} RG ${width} w ${x1.toFixed(2)} ${py1.toFixed(2)} m ${x2.toFixed(2)} ${py2.toFixed(2)} l S Q`
    );
    return this;
  }

  rect(x, y, w, h, { fill = null, stroke = '#000000', width = 1 } = {}) {
    const py = PAGE_HEIGHT - y - h;
    let op = '';
    if (fill) {
      const [r, g, b] = hexToRgb01(fill);
      op += `${r} ${g} ${b} rg `;
    }
    if (stroke) {
      const [r, g, b] = hexToRgb01(stroke);
      op += `${r} ${g} ${b} RG ${width} w `;
    }
    const mode = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.currentOps.push(`q ${op}${x.toFixed(2)} ${py.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${mode} Q`);
    return this;
  }

  build() {
    const objects = [];
    const catalogIdx = objects.push('') - 1;
    const pagesIdx = objects.push('') - 1;
    const font1Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>') - 1;
    const font2Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>') - 1;

    const pageRefs = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const contentIdx = objects.push(
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
      ) - 1;
      const pageIdx = objects.push(
        `<< /Type /Page /Parent ${pagesIdx + 1} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 ${font1Idx + 1} 0 R /F2 ${font2Idx + 1} 0 R >> >> ` +
          `/Contents ${contentIdx + 1} 0 R >>`
      ) - 1;
      pageRefs.push(`${pageIdx + 1} 0 R`);
    }

    objects[catalogIdx] = `<< /Type /Catalog /Pages ${pagesIdx + 1} 0 R >>`;
    objects[pagesIdx] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogIdx + 1} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }
}

module.exports = { SimplePDF, PAGE_WIDTH, PAGE_HEIGHT };
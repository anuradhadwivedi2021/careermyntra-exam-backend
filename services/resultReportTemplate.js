// ============================================
// CareerMyntra Exam Portal - Result / Performance Report PDF
// ============================================
const { SimplePDF, PAGE_WIDTH } = require('./pdfGenerator');

const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatSeconds(sec) {
  if (sec == null) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// detail: the object returned by buildResultDetail() in attemptController.js
function buildResultReportPdf(detail, candidateName) {
  const doc = new SimplePDF();
  let y = MARGIN;

  doc.text(MARGIN, y, 'CAREERMYNTRA', { size: 18, bold: true, color: '#1E3A8A' });
  y += 18;
  doc.text(MARGIN, y, 'Performance Report', { size: 11, color: '#555555' });
  y += 28;

  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y, { color: '#DDDDDD' });
  y += 22;

  doc.text(MARGIN, y, `Candidate: ${candidateName}`, { size: 11, bold: true });
  doc.text(MARGIN + CONTENT_WIDTH / 2, y, `Exam: ${detail.exam_name}`, { size: 11, bold: true });
  y += 20;
  doc.text(MARGIN, y, `Score: ${detail.total_score} / ${detail.total_marks}  (${detail.percentage}%)`, { size: 11 });
  if (detail.rank) doc.text(MARGIN + CONTENT_WIDTH / 2, y, `Rank: #${detail.rank}`, { size: 11 });
  y += 18;
  doc.text(MARGIN, y, `Correct: ${detail.correct_count}   Incorrect: ${detail.incorrect_count}   Unattempted: ${detail.unattempted_count}`, { size: 10, color: '#555555' });
  y += 16;
  doc.text(MARGIN, y, `Time taken: ${formatSeconds(detail.time_taken_seconds)} of ${formatSeconds(detail.duration_seconds)} allotted`, { size: 10, color: '#555555' });
  y += 24;

  if (detail.sections && detail.sections.length > 0) {
    doc.text(MARGIN, y, 'Section-wise Performance', { size: 13, bold: true, color: '#1E3A8A' });
    y += 18;
    for (const s of detail.sections) {
      const pct = s.max_marks > 0 ? ((s.marks_obtained / s.max_marks) * 100).toFixed(1) : '0.0';
      doc.text(MARGIN, y, `${s.subject}: ${s.marks_obtained}/${s.max_marks} (${pct}%) — ${s.correct} correct, ${s.incorrect} incorrect, ${s.unattempted} skipped`, { size: 10 });
      y += 15;
    }
    y += 10;
  }

  if (detail.questions && detail.questions.length > 0) {
    doc.text(MARGIN, y, 'Question-wise Analysis', { size: 13, bold: true, color: '#1E3A8A' });
    y += 18;

    for (const q of detail.questions) {
      if (y > 760) { doc.newPage(); y = MARGIN; }

      const status = q.is_pending_evaluation ? 'Pending evaluation' : q.is_correct === null ? 'Unattempted' : q.is_correct ? 'Correct' : 'Incorrect';
      const statusColor = status === 'Correct' ? '#1A7F37' : status === 'Incorrect' ? '#C0392B' : '#8A6D00';

      y = doc.wrapText(MARGIN, y, `Q${q.question_number}. ${q.question_text}`, CONTENT_WIDTH, { size: 10, bold: true });
      doc.text(MARGIN, y, `[${status}]`, { size: 9, bold: true, color: statusColor });
      y += 14;

      if (q.your_answer) {
        y = doc.wrapText(MARGIN, y, `Your answer: ${q.your_answer}`, CONTENT_WIDTH, { size: 9, color: '#333333' });
      }
      if (q.correct_answer) {
        y = doc.wrapText(MARGIN, y, `Correct answer: ${q.correct_answer}`, CONTENT_WIDTH, { size: 9, color: '#1A7F37' });
      }
      if (q.explanation) {
        y = doc.wrapText(MARGIN, y, `Explanation: ${q.explanation}`, CONTENT_WIDTH, { size: 9, color: '#555555' });
      }
      y += 10;
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y, { color: '#EEEEEE' });
      y += 14;
    }
  }

  return doc.build();
}

module.exports = { buildResultReportPdf };
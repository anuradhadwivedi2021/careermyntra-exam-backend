const pool = require('../config/db');
const ExcelJS = require('exceljs');
const { SimplePDF, PAGE_WIDTH } = require('../services/pdfGenerator');

// Exam-wise summary report
exports.examReport = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const examResult = await pool.query('SELECT exam_name FROM exams WHERE exam_id = $1', [exam_id]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const summary = await pool.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(total_score) AS average_score,
         MAX(total_score) AS highest_score,
         MIN(total_score) AS lowest_score,
         COUNT(CASE WHEN total_score >= (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS pass_count,
         COUNT(CASE WHEN total_score < (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS fail_count
       FROM exam_attempts
       WHERE exam_id = $1 AND status = 'submitted'`,
      [exam_id]
    );

    const candidates = await pool.query(
      `SELECT c.candidate_id, c.full_name, c.mobile_number, ea.total_score, ea.percentage, ea.end_time
       FROM exam_attempts ea
       JOIN candidates c ON c.candidate_id = ea.candidate_id
       WHERE ea.exam_id = $1 AND ea.status = 'submitted'
       ORDER BY ea.total_score DESC`,
      [exam_id]
    );

    res.json({
      success: true,
      exam_name: examResult.rows[0].exam_name,
      summary: summary.rows[0],
      candidates: candidates.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Student-wise report (all exams taken by one candidate)
exports.studentReport = async (req, res) => {
  const { candidate_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT e.exam_name, ea.attempt_id, ea.total_score, ea.percentage, ea.status, ea.start_time, ea.end_time
       FROM exam_attempts ea
       JOIN exams e ON e.exam_id = ea.exam_id
       WHERE ea.candidate_id = $1
       ORDER BY ea.start_time DESC`,
      [candidate_id]
    );
    res.json({ success: true, attempts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Overall admin dashboard stats + chart data
exports.dashboardStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM candidates) AS total_candidates,
        (SELECT COUNT(*) FROM candidates WHERE mobile_verified = true) AS verified_candidates,
        (SELECT COUNT(*) FROM exams) AS total_exams,
        (SELECT COUNT(*) FROM exams WHERE status = 'published') AS active_exams,
        (SELECT COUNT(*) FROM exams WHERE status = 'draft') AS draft_exams,
        (SELECT COUNT(*) FROM exam_attempts WHERE status = 'submitted') AS total_attempts,
        (SELECT COUNT(*) FROM exam_attempts WHERE status = 'in_progress') AS ongoing_attempts,
        (SELECT COUNT(*) FROM exam_attempts WHERE needs_evaluation = true) AS pending_evaluations,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'success') AS total_revenue,
        (SELECT COUNT(*) FROM results r JOIN exams e ON e.exam_id = r.exam_id WHERE r.total_score >= COALESCE(e.passing_marks, 0)) AS pass_count,
        (SELECT COUNT(*) FROM results r JOIN exams e ON e.exam_id = r.exam_id WHERE r.total_score < COALESCE(e.passing_marks, 0)) AS fail_count
    `);

    // Candidate registrations per day, last 14 days
    const registrationsByDay = await pool.query(`
      SELECT TO_CHAR(d.day, 'DD Mon') AS label, COUNT(c.candidate_id) AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') d(day)
      LEFT JOIN candidates c ON DATE(c.created_at) = d.day
      GROUP BY d.day ORDER BY d.day
    `);

    // Exam attempts per day, last 14 days
    const attemptsByDay = await pool.query(`
      SELECT TO_CHAR(d.day, 'DD Mon') AS label, COUNT(a.attempt_id) AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') d(day)
      LEFT JOIN exam_attempts a ON DATE(a.start_time) = d.day
      GROUP BY d.day ORDER BY d.day
    `);

    // Top 5 exams by attempt count
    const topExams = await pool.query(`
      SELECT e.exam_name, COUNT(a.attempt_id) AS attempts
      FROM exams e
      LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id
      GROUP BY e.exam_id, e.exam_name
      ORDER BY attempts DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: stats.rows[0],
      charts: {
        registrations_by_day: registrationsByDay.rows,
        attempts_by_day: attemptsByDay.rows,
        top_exams: topExams.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Sends the given ExcelJS workbook to the client as either .xlsx or .csv,
// based on ?format=excel|csv (defaults to excel). Shared by both export endpoints below.
async function sendWorkbook(res, workbook, format, filenameBase) {
  const safeName = filenameBase.replace(/[^a-z0-9_-]/gi, '_');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    await workbook.csv.write(res);
  } else {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
  }
  res.end();
}

// Export exam-wise report as Excel or CSV — GET /api/reports/exam/:exam_id/export?format=excel|csv
exports.exportExamReport = async (req, res) => {
  const { exam_id } = req.params;
  const format = (req.query.format || 'excel').toLowerCase();

  try {
    const examResult = await pool.query('SELECT exam_name FROM exams WHERE exam_id = $1', [exam_id]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const examName = examResult.rows[0].exam_name;

    const summary = await pool.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(total_score) AS average_score,
         MAX(total_score) AS highest_score,
         MIN(total_score) AS lowest_score,
         COUNT(CASE WHEN total_score >= (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS pass_count,
         COUNT(CASE WHEN total_score < (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS fail_count
       FROM exam_attempts
       WHERE exam_id = $1 AND status = 'submitted'`,
      [exam_id]
    );

    const candidates = await pool.query(
      `SELECT c.full_name, c.mobile_number, ea.total_score, ea.percentage, ea.end_time
       FROM exam_attempts ea
       JOIN candidates c ON c.candidate_id = ea.candidate_id
       WHERE ea.exam_id = $1 AND ea.status = 'submitted'
       ORDER BY ea.total_score DESC`,
      [exam_id]
    );

    const s = summary.rows[0];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Exam Report');

    sheet.addRow([`Exam Report: ${examName}`]);
    sheet.addRow([]);
    sheet.addRow(['Total Attempts', s.total_attempts]);
    sheet.addRow(['Average Score', s.average_score]);
    sheet.addRow(['Highest Score', s.highest_score]);
    sheet.addRow(['Lowest Score', s.lowest_score]);
    sheet.addRow(['Pass Count', s.pass_count]);
    sheet.addRow(['Fail Count', s.fail_count]);
    sheet.addRow([]);

    const headerRow = sheet.addRow(['Candidate Name', 'Mobile Number', 'Score', 'Percentage', 'Submitted At']);
    headerRow.font = { bold: true };

    candidates.rows.forEach((c) => {
      sheet.addRow([c.full_name, c.mobile_number, c.total_score, c.percentage, c.end_time]);
    });

    sheet.columns.forEach((col) => { col.width = 22; });

    await sendWorkbook(res, workbook, format, `exam_report_${examName}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Export student-wise report as Excel or CSV — GET /api/reports/student/:candidate_id/export?format=excel|csv
exports.exportStudentReport = async (req, res) => {
  const { candidate_id } = req.params;
  const format = (req.query.format || 'excel').toLowerCase();

  try {
    const candidateResult = await pool.query(
      'SELECT full_name, mobile_number FROM candidates WHERE candidate_id = $1',
      [candidate_id]
    );
    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    const candidate = candidateResult.rows[0];

    const attempts = await pool.query(
      `SELECT e.exam_name, ea.total_score, ea.percentage, ea.status, ea.start_time, ea.end_time
       FROM exam_attempts ea
       JOIN exams e ON e.exam_id = ea.exam_id
       WHERE ea.candidate_id = $1
       ORDER BY ea.start_time DESC`,
      [candidate_id]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Student Report');

    sheet.addRow([`Student Report: ${candidate.full_name} (${candidate.mobile_number})`]);
    sheet.addRow([]);

    const headerRow = sheet.addRow(['Exam Name', 'Score', 'Percentage', 'Status', 'Start Time', 'End Time']);
    headerRow.font = { bold: true };

    attempts.rows.forEach((a) => {
      sheet.addRow([a.exam_name, a.total_score, a.percentage, a.status, a.start_time, a.end_time]);
    });

    sheet.columns.forEach((col) => { col.width = 22; });

    await sendWorkbook(res, workbook, format, `student_report_${candidate.full_name}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Question-wise report for an exam — correct/incorrect/skipped % and difficulty per question
exports.questionReport = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const examResult = await pool.query('SELECT exam_name FROM exams WHERE exam_id = $1', [exam_id]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const totalAttempts = await pool.query(
      `SELECT COUNT(*) FROM exam_attempts WHERE exam_id = $1 AND status = 'submitted'`,
      [exam_id]
    );
    const attemptCount = parseInt(totalAttempts.rows[0].count) || 0;

    const questions = await pool.query(
      `SELECT q.question_id, q.question_text, q.subject, q.difficulty, q.marks,
              COUNT(ca.answer_id) FILTER (WHERE ca.answer_id IS NOT NULL) AS attempted_count,
              COUNT(ca.answer_id) FILTER (WHERE ca.is_correct = true) AS correct_count,
              COUNT(ca.answer_id) FILTER (WHERE ca.is_correct = false) AS incorrect_count
       FROM questions q
       LEFT JOIN candidate_answers ca ON ca.question_id = q.question_id
         AND ca.attempt_id IN (SELECT attempt_id FROM exam_attempts WHERE exam_id = $1 AND status = 'submitted')
       WHERE q.exam_id = $1
       GROUP BY q.question_id, q.question_text, q.subject, q.difficulty, q.marks
       ORDER BY q.question_id ASC`,
      [exam_id]
    );

    const rows = questions.rows.map((q) => {
      const attempted = parseInt(q.attempted_count) || 0;
      const correct = parseInt(q.correct_count) || 0;
      const incorrect = parseInt(q.incorrect_count) || 0;
      const skipped = attemptCount - attempted;
      return {
        question_id: q.question_id,
        question_text: q.question_text,
        subject: q.subject || 'General',
        difficulty: q.difficulty || 'medium',
        marks: parseFloat(q.marks) || 0,
        correct_pct: attemptCount > 0 ? +((correct / attemptCount) * 100).toFixed(1) : 0,
        incorrect_pct: attemptCount > 0 ? +((incorrect / attemptCount) * 100).toFixed(1) : 0,
        skipped_pct: attemptCount > 0 ? +((skipped / attemptCount) * 100).toFixed(1) : 0,
      };
    });

    res.json({ success: true, exam_name: examResult.rows[0].exam_name, total_attempts: attemptCount, questions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Export the exam-wise report as a printable PDF — GET /api/reports/exam/:exam_id/export-pdf
exports.examReportPdf = async (req, res) => {
  const { exam_id } = req.params;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  try {
    const examResult = await pool.query('SELECT exam_name FROM exams WHERE exam_id = $1', [exam_id]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const examName = examResult.rows[0].exam_name;

    const summary = await pool.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(total_score) AS average_score,
         MAX(total_score) AS highest_score,
         MIN(total_score) AS lowest_score,
         COUNT(CASE WHEN total_score >= (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS pass_count,
         COUNT(CASE WHEN total_score < (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS fail_count
       FROM exam_attempts
       WHERE exam_id = $1 AND status = 'submitted'`,
      [exam_id]
    );
    const s = summary.rows[0];

    const candidates = await pool.query(
      `SELECT c.full_name, c.mobile_number, ea.total_score, ea.percentage, ea.end_time
       FROM exam_attempts ea
       JOIN candidates c ON c.candidate_id = ea.candidate_id
       WHERE ea.exam_id = $1 AND ea.status = 'submitted'
       ORDER BY ea.total_score DESC`,
      [exam_id]
    );

    const doc = new SimplePDF();
    let y = MARGIN;
    doc.text(MARGIN, y, 'CAREERMYNTRA', { size: 18, bold: true, color: '#1E3A8A' });
    y += 18;
    doc.text(MARGIN, y, `Exam Report — ${examName}`, { size: 11, color: '#555555' });
    y += 28;
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y, { color: '#DDDDDD' });
    y += 22;

    doc.text(MARGIN, y, `Total Attempts: ${s.total_attempts}`, { size: 10 });
    doc.text(MARGIN + CONTENT_WIDTH / 2, y, `Average Score: ${s.average_score ? parseFloat(s.average_score).toFixed(1) : '-'}`, { size: 10 });
    y += 16;
    doc.text(MARGIN, y, `Highest: ${s.highest_score ?? '-'}`, { size: 10 });
    doc.text(MARGIN + CONTENT_WIDTH / 2, y, `Lowest: ${s.lowest_score ?? '-'}`, { size: 10 });
    y += 16;
    doc.text(MARGIN, y, `Passed: ${s.pass_count}`, { size: 10, color: '#1A7F37' });
    doc.text(MARGIN + CONTENT_WIDTH / 2, y, `Failed: ${s.fail_count}`, { size: 10, color: '#C0392B' });
    y += 26;

    doc.text(MARGIN, y, 'Candidate Results', { size: 13, bold: true, color: '#1E3A8A' });
    y += 18;

    for (const c of candidates.rows) {
      if (y > 780) { doc.newPage(); y = MARGIN; }
      doc.text(MARGIN, y, `${c.full_name} (${c.mobile_number})`, { size: 9 });
      doc.text(MARGIN + 320, y, `${c.total_score} marks — ${c.percentage}%`, { size: 9 });
      y += 15;
    }

    const pdfBuffer = doc.build();
    const safeName = examName.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ExamReport_${safeName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
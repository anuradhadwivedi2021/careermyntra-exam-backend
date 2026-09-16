const pool = require('../config/db');
const { buildAdmitCardPdf } = require('../services/admitCardTemplate');
const { checkEligibility } = require('../services/eligibilityService');

// Candidate: register for an exam
exports.registerForExam = async (req, res) => {
  const { exam_id } = req.body;
  const candidate_id = req.candidate.candidate_id;

  if (!exam_id) {
    return res.status(400).json({ success: false, message: 'exam_id is required' });
  }

  try {
    const examResult = await pool.query(
      `SELECT exam_id, status, is_free, price, requires_approval, start_datetime, end_datetime,
              has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction
       FROM exams WHERE exam_id = $1`,
      [exam_id]
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examResult.rows[0];
    if (exam.status !== 'published') {
      return res.status(400).json({ success: false, message: 'This exam is not open for registration' });
    }
    if (!exam.is_free && Number(exam.price) > 0) {
      return res.status(400).json({ success: false, message: 'This is a paid exam — complete payment to register' });
    }
    if (exam.end_datetime && new Date() > new Date(exam.end_datetime)) {
      return res.status(400).json({ success: false, message: 'Registration for this exam has closed' });
    }

    if (exam.has_eligibility_criteria) {
      const candidateResult = await pool.query(
        'SELECT date_of_birth, gender, qualification FROM candidates WHERE candidate_id = $1',
        [candidate_id]
      );
      const candidate = candidateResult.rows[0] || {};
      const eligibility = checkEligibility(exam, candidate);
      if (!eligibility.eligible) {
        return res.status(403).json({ success: false, message: eligibility.message, eligibility_failed: true });
      }
    }

    const existing = await pool.query(
      'SELECT registration_id FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Already registered for this exam' });
    }

    const initialStatus = exam.requires_approval ? 'pending' : 'approved';

    const result = await pool.query(
      `INSERT INTO exam_registrations (candidate_id, exam_id, status)
       VALUES ($1, $2, $3) RETURNING registration_id, registered_at, status`,
      [candidate_id, exam_id, initialStatus]
    );

    res.status(201).json({
      success: true,
      message: exam.requires_approval
        ? 'Registered — waiting for admin approval before you can start the exam.'
        : 'Registered successfully',
      registration: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Candidate: list exam_ids they are registered for, with status (used to toggle Register/Start button)
exports.myRegistrations = async (req, res) => {
  const candidate_id = req.candidate.candidate_id;
  try {
    const result = await pool.query(
      'SELECT registration_id, exam_id, registered_at, status FROM exam_registrations WHERE candidate_id = $1',
      [candidate_id]
    );
    res.json({ success: true, registrations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list candidates registered for a given exam
exports.examRegistrations = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.registration_id, r.registered_at, r.status, c.candidate_id, c.full_name, c.mobile_number, c.email
       FROM exam_registrations r
       JOIN candidates c ON c.candidate_id = r.candidate_id
       WHERE r.exam_id = $1
       ORDER BY (r.status = 'pending') DESC, r.registered_at DESC`,
      [exam_id]
    );
    res.json({ success: true, registrations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list all pending registrations across every exam
exports.pendingRegistrations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.registration_id, r.registered_at, r.status, r.exam_id, e.exam_name,
              c.candidate_id, c.full_name, c.mobile_number, c.email
       FROM exam_registrations r
       JOIN exams e ON e.exam_id = r.exam_id
       JOIN candidates c ON c.candidate_id = r.candidate_id
       WHERE r.status = 'pending'
       ORDER BY r.registered_at ASC`
    );
    res.json({ success: true, registrations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: approve a pending registration
exports.approveRegistration = async (req, res) => {
  const { registration_id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE exam_registrations SET status = 'approved' WHERE registration_id = $1 RETURNING *`,
      [registration_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    res.json({ success: true, message: 'Registration approved', registration: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: reject a pending registration
exports.rejectRegistration = async (req, res) => {
  const { registration_id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE exam_registrations SET status = 'rejected' WHERE registration_id = $1 RETURNING *`,
      [registration_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    res.json({ success: true, message: 'Registration rejected', registration: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Shared helper: loads registration + exam + candidate + branding and
// renders the admit card PDF. Throws { status, message } on a business-rule
// failure so both the candidate and admin endpoints can reuse it.
async function loadAndBuildAdmitCard({ candidate_id, exam_id, registration_id }) {
  const regQuery = registration_id
    ? await pool.query(
        `SELECT registration_id, candidate_id, exam_id, registered_at, status
         FROM exam_registrations WHERE registration_id = $1`,
        [registration_id]
      )
    : await pool.query(
        `SELECT registration_id, candidate_id, exam_id, registered_at, status
         FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2`,
        [candidate_id, exam_id]
      );

  if (regQuery.rows.length === 0) {
    const err = new Error('Registration not found');
    err.status = 404;
    throw err;
  }
  const registration = regQuery.rows[0];

  if (registration.status === 'pending') {
    const err = new Error('This registration is awaiting admin approval. Admit card will be available once approved.');
    err.status = 403;
    throw err;
  }
  if (registration.status === 'rejected') {
    const err = new Error('This registration was not approved — admit card is not available.');
    err.status = 403;
    throw err;
  }

  const examResult = await pool.query(
    `SELECT exam_name, category, duration_minutes, total_marks, start_datetime, end_datetime, instructions
     FROM exams WHERE exam_id = $1`,
    [registration.exam_id]
  );
  if (examResult.rows.length === 0) {
    const err = new Error('Exam not found');
    err.status = 404;
    throw err;
  }
  const exam = examResult.rows[0];

  const candResult = await pool.query(
    'SELECT full_name, mobile_number, email FROM candidates WHERE candidate_id = $1',
    [registration.candidate_id]
  );
  if (candResult.rows.length === 0) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  const candidate = candResult.rows[0];

  const settingsResult = await pool.query('SELECT * FROM system_settings WHERE id = 1');
  const settings = settingsResult.rows[0] || {};

  const pdfBuffer = buildAdmitCardPdf({
    registration,
    exam,
    candidate,
    settings,
    exam_id: registration.exam_id,
  });

  return { pdfBuffer, candidate };
}

// Candidate: download their own admit card for an approved exam registration
exports.downloadAdmitCard = async (req, res) => {
  const { exam_id } = req.params;
  const candidate_id = req.candidate.candidate_id;

  try {
    const { pdfBuffer, candidate } = await loadAndBuildAdmitCard({ candidate_id, exam_id });
    const safeName = (candidate.full_name || 'candidate').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AdmitCard_${safeName}_${exam_id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: download any candidate's admit card by registration_id
// (e.g. to re-print, or email manually to a candidate who is stuck)
exports.downloadAdmitCardAdmin = async (req, res) => {
  const { registration_id } = req.params;

  try {
    const { pdfBuffer, candidate } = await loadAndBuildAdmitCard({ registration_id });
    const safeName = (candidate.full_name || 'candidate').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AdmitCard_${safeName}_${registration_id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
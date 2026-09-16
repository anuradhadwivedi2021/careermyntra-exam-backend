const pool = require('../config/db');

// Confirms an attempt exists and belongs to the requesting candidate.
// Returns the attempt row, or null (and already sent the error response) if invalid.
async function getOwnedAttempt(req, res, attempt_id) {
  const candidate_id = req.candidate.candidate_id;
  const result = await pool.query(
    'SELECT * FROM exam_attempts WHERE attempt_id = $1 AND candidate_id = $2',
    [attempt_id, candidate_id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Attempt not found' });
    return null;
  }
  return result.rows[0];
}

// ============ CANDIDATE: LOG A PROCTORING EVENT (tab switch, fullscreen exit, etc.) ============
exports.logEvent = async (req, res) => {
  const { attempt_id, event_type, details } = req.body;

  const validTypes = [
    'tab_switch', 'fullscreen_exit', 'fullscreen_enter',
    'window_blur', 'window_focus', 'copy_paste', 'right_click',
    'multiple_faces', 'no_face', 'suspicious_activity',
  ];
  if (!attempt_id || !validTypes.includes(event_type)) {
    return res.status(400).json({ success: false, message: 'attempt_id and a valid event_type are required' });
  }

  try {
    const attempt = await getOwnedAttempt(req, res, attempt_id);
    if (!attempt) return;

    await pool.query(
      `INSERT INTO proctoring_events (attempt_id, event_type, details) VALUES ($1, $2, $3)`,
      [attempt_id, event_type, details || null]
    );

    // Tell the frontend how many tab-switch/fullscreen-exit events have piled up so far,
    // and whether the exam's configured limit has been crossed — the frontend decides
    // whether to warn the candidate or auto-submit.
    let flagged = false;
    let count = null;
    let limit = null;

    if (event_type === 'tab_switch' || event_type === 'fullscreen_exit') {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM proctoring_events
         WHERE attempt_id = $1 AND event_type IN ('tab_switch', 'fullscreen_exit')`,
        [attempt_id]
      );
      count = countResult.rows[0].count;

      const limitResult = await pool.query(
        `SELECT e.tab_switch_limit FROM exams e
         JOIN exam_attempts a ON a.exam_id = e.exam_id
         WHERE a.attempt_id = $1`,
        [attempt_id]
      );
      limit = limitResult.rows[0]?.tab_switch_limit ?? 3;
      flagged = count >= limit;
    }

    res.status(201).json({ success: true, flagged, count, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ CANDIDATE: SUBMIT A WEBCAM CAPTURE ============
exports.submitCapture = async (req, res) => {
  const { attempt_id, capture_type, image_url } = req.body;

  if (!attempt_id || !['start_photo', 'periodic_photo'].includes(capture_type) || !image_url) {
    return res.status(400).json({ success: false, message: 'attempt_id, a valid capture_type and image_url are required' });
  }

  try {
    const attempt = await getOwnedAttempt(req, res, attempt_id);
    if (!attempt) return;

    const result = await pool.query(
      `INSERT INTO proctoring_captures (attempt_id, capture_type, image_url)
       VALUES ($1, $2, $3) RETURNING capture_id, captured_at`,
      [attempt_id, capture_type, image_url]
    );

    res.status(201).json({ success: true, capture: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ CANDIDATE: SUBMIT ID DOCUMENT + SELFIE FOR VERIFICATION ============
exports.submitIdVerification = async (req, res) => {
  const { attempt_id, id_document_url, selfie_url } = req.body;

  if (!attempt_id || !id_document_url) {
    return res.status(400).json({ success: false, message: 'attempt_id and id_document_url are required' });
  }

  try {
    const attempt = await getOwnedAttempt(req, res, attempt_id);
    if (!attempt) return;

    const result = await pool.query(
      `INSERT INTO id_verifications (attempt_id, id_document_url, selfie_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (attempt_id) DO UPDATE SET
         id_document_url = EXCLUDED.id_document_url,
         selfie_url = EXCLUDED.selfie_url,
         status = 'pending',
         verified_by = NULL,
         verified_at = NULL,
         submitted_at = NOW()
       RETURNING *`,
      [attempt_id, id_document_url, selfie_url || null]
    );

    res.status(201).json({ success: true, verification: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ CANDIDATE: CHECK MY OWN ID VERIFICATION STATUS FOR AN ATTEMPT ============
// Lets the take-exam page skip the upload gate on resume/reload instead of
// asking the candidate to re-submit their ID + selfie every time.
exports.getMyIdVerificationStatus = async (req, res) => {
  const { attempt_id } = req.params;

  try {
    const attempt = await getOwnedAttempt(req, res, attempt_id);
    if (!attempt) return;

    const result = await pool.query(
      'SELECT status, submitted_at FROM id_verifications WHERE attempt_id = $1',
      [attempt_id]
    );

    res.json({ success: true, verification: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: FULL PROCTORING REVIEW FOR ONE ATTEMPT ============
exports.getAttemptProctoring = async (req, res) => {
  const { attempt_id } = req.params;

  try {
    const [eventsResult, capturesResult, verificationResult, attemptResult] = await Promise.all([
      pool.query('SELECT * FROM proctoring_events WHERE attempt_id = $1 ORDER BY occurred_at', [attempt_id]),
      pool.query('SELECT * FROM proctoring_captures WHERE attempt_id = $1 ORDER BY captured_at', [attempt_id]),
      pool.query('SELECT * FROM id_verifications WHERE attempt_id = $1', [attempt_id]),
      pool.query(
        `SELECT a.attempt_id, a.status, c.full_name AS candidate_name, e.exam_name, e.tab_switch_limit
         FROM exam_attempts a
         JOIN candidates c ON c.candidate_id = a.candidate_id
         JOIN exams e ON e.exam_id = a.exam_id
         WHERE a.attempt_id = $1`,
        [attempt_id]
      ),
    ]);

    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    res.json({
      success: true,
      attempt: attemptResult.rows[0],
      events: eventsResult.rows,
      captures: capturesResult.rows,
      id_verification: verificationResult.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: LIST ATTEMPTS FLAGGED FOR SUSPICIOUS ACTIVITY ============
exports.getFlaggedAttempts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.attempt_id, a.status, c.full_name AS candidate_name, e.exam_name,
              e.tab_switch_limit, COUNT(pe.event_id)::int AS event_count
       FROM exam_attempts a
       JOIN candidates c ON c.candidate_id = a.candidate_id
       JOIN exams e ON e.exam_id = a.exam_id
       JOIN proctoring_events pe ON pe.attempt_id = a.attempt_id
       WHERE pe.event_type IN ('tab_switch', 'fullscreen_exit', 'multiple_faces', 'no_face', 'suspicious_activity')
       GROUP BY a.attempt_id, a.status, c.full_name, e.exam_name, e.tab_switch_limit
       HAVING COUNT(pe.event_id) >= 1
       ORDER BY event_count DESC`
    );
    res.json({ success: true, attempts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: APPROVE / REJECT AN ID VERIFICATION ============
exports.reviewIdVerification = async (req, res) => {
  const { verification_id } = req.params;
  const { status, notes } = req.body;

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be verified or rejected' });
  }

  try {
    const result = await pool.query(
      `UPDATE id_verifications SET
        status = $1,
        notes = $2,
        verified_by = $3,
        verified_at = NOW()
       WHERE verification_id = $4 RETURNING *`,
      [status, notes || null, req.admin.admin_id, verification_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Verification record not found' });
    }

    res.json({ success: true, verification: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: TURN PROCTORING ON/OFF FOR AN EXAM ============
exports.updateExamProctoringSettings = async (req, res) => {
  const { exam_id } = req.params;
  const { proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit } = req.body;

  try {
    const result = await pool.query(
      `UPDATE exams SET
        proctoring_enabled = COALESCE($1, proctoring_enabled),
        require_camera = COALESCE($2, require_camera),
        require_fullscreen = COALESCE($3, require_fullscreen),
        require_id_verification = COALESCE($4, require_id_verification),
        tab_switch_limit = COALESCE($5, tab_switch_limit),
        updated_at = NOW()
       WHERE exam_id = $6 RETURNING *`,
      [proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit, exam_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    res.json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
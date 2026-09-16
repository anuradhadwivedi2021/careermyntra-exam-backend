const pool = require('../config/db');

const VALID_QUALIFICATIONS = ['none', '10th', '12th', 'diploma', 'graduate', 'postgraduate'];
const VALID_GENDER_RESTRICTIONS = ['any', 'male', 'female'];
const VALID_STATUSES = ['draft', 'published', 'closed'];

// Admin: create exam
exports.createExam = async (req, res) => {
  const {
    exam_name, description, instructions, duration_minutes,
    total_marks, passing_marks, negative_marking,
    negative_marks_per_question, attempt_limit, is_free, price, category, exam_type,
    show_result_immediately, show_correct_answers, show_explanation, show_rank,
    result_publish_at,
    requires_approval,
    has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction, eligibility_notes,
    start_datetime, end_datetime, status,
    proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit,
    randomize_questions, randomize_options
  } = req.body;

  if (!exam_name || !duration_minutes || !total_marks) {
    return res.status(400).json({ success: false, message: 'exam_name, duration_minutes and total_marks are required' });
  }
  if (min_qualification && !VALID_QUALIFICATIONS.includes(min_qualification)) {
    return res.status(400).json({ success: false, message: 'Invalid min_qualification value' });
  }
  if (gender_restriction && !VALID_GENDER_RESTRICTIONS.includes(gender_restriction)) {
    return res.status(400).json({ success: false, message: 'Invalid gender_restriction value' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }
  if (start_datetime && end_datetime && new Date(start_datetime) >= new Date(end_datetime)) {
    return res.status(400).json({ success: false, message: 'end_datetime must be after start_datetime' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO exams
        (exam_name, description, instructions, duration_minutes, total_marks, passing_marks,
         negative_marking, negative_marks_per_question, attempt_limit, is_free, price, category, exam_type,
         show_result_immediately, show_correct_answers, show_explanation, show_rank, result_publish_at, requires_approval,
         has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction, eligibility_notes,
         start_datetime, end_datetime, status,
         proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit,
         randomize_questions, randomize_options)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
       RETURNING *`,
      [exam_name, description, instructions, duration_minutes, total_marks, passing_marks || null,
       negative_marking || false, negative_marks_per_question || 0, attempt_limit || 1, is_free !== false,
       is_free === false ? (price || 0) : 0, category || 'mock', exam_type || null,
       show_result_immediately !== false, show_correct_answers !== false, show_explanation !== false, show_rank !== false,
       result_publish_at || null,
       requires_approval === true,
       has_eligibility_criteria === true, min_qualification || 'none', min_age || null, max_age || null,
       gender_restriction || 'any', eligibility_notes || null,
       start_datetime || null, end_datetime || null,
       // New exams default to 'draft' unless the caller explicitly asks for something else —
       // previously this was hardcoded to 'published', so every exam went live the instant
       // it was created, with no way to save a draft first.
       status || 'draft',
       proctoring_enabled === true, require_camera === true, require_fullscreen === true,
       require_id_verification === true, tab_switch_limit || 3,
       randomize_questions === true, randomize_options === true]
    );
    res.status(201).json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Candidate/public: list all published exams
exports.listExams = async (req, res) => {
  const { category } = req.query;
  try {
    const params = [];
    let where = `WHERE status = 'published'`;
    if (category) {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT exam_id, exam_name, description, duration_minutes, total_marks,
              passing_marks, is_free, price, status, category, start_datetime, end_datetime
       FROM exams ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, exams: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Get single exam details
exports.getExamById = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM exams WHERE exam_id = $1', [exam_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update exam
exports.updateExam = async (req, res) => {
  const { exam_id } = req.params;
  const {
    exam_name, description, instructions, duration_minutes,
    total_marks, passing_marks, negative_marking,
    negative_marks_per_question, attempt_limit, is_free, price, status, category, exam_type,
    show_result_immediately, show_correct_answers, show_explanation, show_rank, result_publish_at,
    requires_approval,
    has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction, eligibility_notes,
    start_datetime, end_datetime,
    proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit,
    randomize_questions, randomize_options
  } = req.body;

  if (min_qualification && !VALID_QUALIFICATIONS.includes(min_qualification)) {
    return res.status(400).json({ success: false, message: 'Invalid min_qualification value' });
  }
  if (gender_restriction && !VALID_GENDER_RESTRICTIONS.includes(gender_restriction)) {
    return res.status(400).json({ success: false, message: 'Invalid gender_restriction value' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }
  if (start_datetime && end_datetime && new Date(start_datetime) >= new Date(end_datetime)) {
    return res.status(400).json({ success: false, message: 'end_datetime must be after start_datetime' });
  }

  try {
    const result = await pool.query(
      `UPDATE exams SET
        exam_name = COALESCE($1, exam_name),
        description = COALESCE($2, description),
        instructions = COALESCE($3, instructions),
        duration_minutes = COALESCE($4, duration_minutes),
        total_marks = COALESCE($5, total_marks),
        passing_marks = COALESCE($6, passing_marks),
        negative_marking = COALESCE($7, negative_marking),
        negative_marks_per_question = COALESCE($8, negative_marks_per_question),
        attempt_limit = COALESCE($9, attempt_limit),
        is_free = COALESCE($10, is_free),
        price = COALESCE($11, price),
        status = COALESCE($12, status),
        show_result_immediately = COALESCE($13, show_result_immediately),
        show_correct_answers = COALESCE($14, show_correct_answers),
        show_explanation = COALESCE($15, show_explanation),
        show_rank = COALESCE($16, show_rank),
        requires_approval = COALESCE($17, requires_approval),
        has_eligibility_criteria = COALESCE($18, has_eligibility_criteria),
        min_qualification = COALESCE($19, min_qualification),
        min_age = $20,
        max_age = $21,
        gender_restriction = COALESCE($22, gender_restriction),
        eligibility_notes = $23,
        start_datetime = $24,
        end_datetime = $25,
        category = COALESCE($27, category),
        exam_type = COALESCE($28, exam_type),
        result_publish_at = $29,
        proctoring_enabled = COALESCE($30, proctoring_enabled),
        require_camera = COALESCE($31, require_camera),
        require_fullscreen = COALESCE($32, require_fullscreen),
        require_id_verification = COALESCE($33, require_id_verification),
        tab_switch_limit = COALESCE($34, tab_switch_limit),
        randomize_questions = COALESCE($35, randomize_questions),
        randomize_options = COALESCE($36, randomize_options),
        updated_at = NOW()
       WHERE exam_id = $26
       RETURNING *`,
      [exam_name, description, instructions, duration_minutes, total_marks, passing_marks,
       negative_marking, negative_marks_per_question, attempt_limit, is_free, price, status,
       show_result_immediately, show_correct_answers, show_explanation, show_rank, requires_approval,
       has_eligibility_criteria, min_qualification, min_age || null, max_age || null,
       gender_restriction, eligibility_notes || null,
       start_datetime || null, end_datetime || null, exam_id,
       category || null, exam_type || null, result_publish_at || null,
       proctoring_enabled, require_camera, require_fullscreen, require_id_verification, tab_switch_limit,
       randomize_questions, randomize_options]
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

// Admin: delete exam
exports.deleteExam = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM exams WHERE exam_id = $1 RETURNING exam_id', [exam_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list ALL exams (including drafts) - for admin dashboard
exports.listAllExamsForAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT exam_id, exam_name, description, duration_minutes, total_marks,
              passing_marks, is_free, status, attempt_limit, created_at, start_datetime, end_datetime
       FROM exams ORDER BY created_at DESC`
    );
    res.json({ success: true, exams: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};




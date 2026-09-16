const pool = require('../config/db');

// Public/candidate + admin: list an exam's sections in order, with each
// section's question count (used to render section tabs on both the
// candidate take-exam screen and the admin questions screen).
exports.listSections = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.section_id, s.exam_id, s.section_name, s.section_order, s.total_marks,
              COUNT(q.question_id)::int AS question_count,
              COALESCE(SUM(q.marks), 0)::int AS questions_marks_sum
       FROM exam_sections s
       LEFT JOIN questions q ON q.section_id = s.section_id
       WHERE s.exam_id = $1
       GROUP BY s.section_id
       ORDER BY s.section_order ASC, s.section_id ASC`,
      [exam_id]
    );
    res.json({ success: true, sections: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: create a section for an exam. Defaults section_order to "last".
exports.createSection = async (req, res) => {
  const { exam_id } = req.params;
  const { section_name, section_order, total_marks } = req.body;

  if (!section_name || !section_name.trim()) {
    return res.status(400).json({ success: false, message: 'section_name is required' });
  }
  if (total_marks !== undefined && total_marks !== null && Number(total_marks) < 0) {
    return res.status(400).json({ success: false, message: 'total_marks cannot be negative' });
  }

  try {
    let order = section_order;
    if (order === undefined || order === null) {
      const maxRes = await pool.query(
        'SELECT COALESCE(MAX(section_order), 0) + 1 AS next_order FROM exam_sections WHERE exam_id = $1',
        [exam_id]
      );
      order = maxRes.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO exam_sections (exam_id, section_name, section_order, total_marks)
       VALUES ($1, $2, $3, $4) RETURNING section_id, exam_id, section_name, section_order, total_marks`,
      [exam_id, section_name.trim(), order, total_marks ?? null]
    );
    res.status(201).json({ success: true, section: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: rename a section, change its order, or set its marks allocation.
exports.updateSection = async (req, res) => {
  const { section_id } = req.params;
  const { section_name, section_order, total_marks } = req.body;

  if (total_marks !== undefined && total_marks !== null && Number(total_marks) < 0) {
    return res.status(400).json({ success: false, message: 'total_marks cannot be negative' });
  }

  try {
    const result = await pool.query(
      `UPDATE exam_sections
       SET section_name = COALESCE($1, section_name),
           section_order = COALESCE($2, section_order),
           total_marks = COALESCE($4, total_marks)
       WHERE section_id = $3
       RETURNING section_id, exam_id, section_name, section_order, total_marks`,
      [section_name ? section_name.trim() : null, section_order ?? null, section_id, total_marks ?? null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    res.json({ success: true, section: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: delete a section. Its questions are NOT deleted — they fall back
// to "ungrouped" (section_id set to NULL by the FK's ON DELETE SET NULL).
exports.deleteSection = async (req, res) => {
  const { section_id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM exam_sections WHERE section_id = $1 RETURNING section_id',
      [section_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    res.json({ success: true, message: 'Section deleted. Its questions are now ungrouped.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: move a question into a section (or ungroup it by passing section_id: null).
exports.assignQuestionSection = async (req, res) => {
  const { question_id } = req.params;
  const { section_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE questions SET section_id = $1 WHERE question_id = $2
       RETURNING question_id, section_id`,
      [section_id ?? null, question_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    res.json({ success: true, question: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
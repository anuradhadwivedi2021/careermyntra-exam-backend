const pool = require('../config/db');
const { runTestCases, SUPPORTED_LANGUAGES } = require('../services/codeExecutionService');

// ============ CANDIDATE: RUN CODE (sample/visible test cases only) ============
exports.runCode = async (req, res) => {
  const { question_id, code, language } = req.body;

  if (!question_id || code === undefined || !language) {
    return res.status(400).json({ success: false, message: 'question_id, code and language are required' });
  }
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, message: `Unsupported language. Use one of: ${SUPPORTED_LANGUAGES.join(', ')}` });
  }

  try {
    const questionResult = await pool.query(
      `SELECT question_id, time_limit_seconds FROM questions WHERE question_id = $1 AND question_type = 'coding'`,
      [question_id]
    );
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coding question not found' });
    }
    const question = questionResult.rows[0];

    const testCasesResult = await pool.query(
      `SELECT test_case_id, input, expected_output, is_hidden
       FROM coding_test_cases WHERE question_id = $1 AND is_hidden = false ORDER BY test_case_id ASC`,
      [question_id]
    );

    if (testCasesResult.rows.length === 0) {
      return res.json({ success: true, message: 'No sample test cases for this question', results: [] });
    }

    const results = await runTestCases(code, language, testCasesResult.rows, question.time_limit_seconds || 2);
    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ LIST TEST CASES FOR A QUESTION ============
exports.listTestCases = async (req, res) => {
  const { question_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT test_case_id, question_id, input, expected_output, is_hidden, created_at
       FROM coding_test_cases WHERE question_id = $1 ORDER BY test_case_id ASC`,
      [question_id]
    );
    res.json({ success: true, test_cases: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADD TEST CASE ============
exports.addTestCase = async (req, res) => {
  const { question_id, input, expected_output, is_hidden } = req.body;

  if (!question_id || !expected_output) {
    return res.status(400).json({ success: false, message: 'question_id and expected_output are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO coding_test_cases (question_id, input, expected_output, is_hidden)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [question_id, input || '', expected_output, is_hidden !== false]
    );
    res.status(201).json({ success: true, message: 'Test case added', test_case: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ UPDATE TEST CASE ============
exports.updateTestCase = async (req, res) => {
  const { test_case_id } = req.params;
  const { input, expected_output, is_hidden } = req.body;

  if (!expected_output) {
    return res.status(400).json({ success: false, message: 'expected_output is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE coding_test_cases SET input = $1, expected_output = $2, is_hidden = $3
       WHERE test_case_id = $4 RETURNING *`,
      [input || '', expected_output, is_hidden !== false, test_case_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }
    res.json({ success: true, message: 'Test case updated', test_case: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ DELETE TEST CASE ============
exports.deleteTestCase = async (req, res) => {
  const { test_case_id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM coding_test_cases WHERE test_case_id = $1 RETURNING test_case_id`,
      [test_case_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }
    res.json({ success: true, message: 'Test case deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
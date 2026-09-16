const pool = require('../config/db');
const exceljs = require('exceljs');
const fastcsv = require('fast-csv');
const { Readable } = require('stream');

const RECOGNIZED_TYPES = ['subjective', 'coding', 'true_false', 'multi_select'];

function resolveQuestionType(question_type) {
  return RECOGNIZED_TYPES.includes(question_type) ? question_type : 'mcq';
}

function needsOptions(qType) {
  return ['mcq', 'true_false', 'multi_select'].includes(qType);
}

// Deterministic seeded shuffle (Fisher-Yates). The SAME seed always produces
// the SAME order — so a candidate sees a stable question/option order across
// refresh, save-progress reload, and resume-after-disconnect (only the order
// they're SHOWN changes; scoring is by question_id/option_id, never by
// position, so this is purely cosmetic and never affects marks). DIFFERENT
// candidates (different seeds) see different orders, which is the point —
// it stops "answer is always option C" / "copy the person next to you"
// style cheating on objective exams.
function seededShuffle(array, seed) {
  const arr = array.slice();
  let s = 0;
  for (let i = 0; i < String(seed).length; i++) {
    s = (s * 31 + String(seed).charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Shared insert logic used by BOTH bulk endpoints (JSON body and file
// upload) so a row behaves identically no matter which way it came in.
async function insertQuestionsBulk(client, exam_id, questions) {
  let addedCount = 0;
  const errors = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qType = resolveQuestionType(q.question_type);
    if (!q.question_text) {
      errors.push(`Row ${i + 1}: missing question_text`);
      continue;
    }
    if (needsOptions(qType) && (!q.options || q.options.length < 2)) {
      errors.push(`Row ${i + 1}: this question type needs at least 2 options`);
      continue;
    }
    if (needsOptions(qType) && !q.options.some((o) => o.is_correct)) {
      errors.push(`Row ${i + 1}: at least one option must be marked correct`);
      continue;
    }
    if (qType === 'coding' && (!q.test_cases || q.test_cases.filter((tc) => tc.expected_output && tc.expected_output.trim()).length === 0)) {
      errors.push(`Row ${i + 1}: coding question needs at least 1 test case`);
      continue;
    }

    const qResult = await client.query(
      `INSERT INTO questions (exam_id, question_text, subject, topic, difficulty, marks, negative_marks, explanation, question_type, word_limit, starter_code, time_limit_seconds, section_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING question_id`,
      [exam_id, q.question_text, q.subject || null, q.topic || null, q.difficulty || 'medium',
       q.marks || 1, q.negative_marks || 0, q.explanation || null, qType,
       qType === 'subjective' ? (q.word_limit || null) : null,
       qType === 'coding' ? (q.starter_code || null) : null,
       qType === 'coding' ? (q.time_limit_seconds || 2) : null,
       q.section_id || null]
    );
    const question_id = qResult.rows[0].question_id;

    if (needsOptions(qType)) {
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, option_order)
           VALUES ($1,$2,$3,$4)`,
          [question_id, opt.option_text, opt.is_correct || false, j + 1]
        );
      }
    }

    if (qType === 'coding') {
      for (const tc of q.test_cases) {
        if (!tc.expected_output || !tc.expected_output.trim()) continue;
        await client.query(
          `INSERT INTO coding_test_cases (question_id, input, expected_output, is_hidden)
           VALUES ($1,$2,$3,$4)`,
          [question_id, tc.input || '', tc.expected_output, tc.is_hidden !== false]
        );
      }
    }

    addedCount++;
  }

  return { addedCount, errors };
}

// Turns "1" or "1,3" (1-based option numbers, as a non-technical admin would
// type them in a spreadsheet) into a 0-based Set for matching against
// option_1/option_2/... columns.
function parseCorrectOptions(value) {
  if (value === undefined || value === null || value === '') return new Set();
  return new Set(
    String(value)
      .split(',')
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((n) => !Number.isNaN(n))
  );
}

// Maps one parsed spreadsheet row (object keyed by lowercase, underscored
// header names) into the same question shape insertQuestionsBulk expects.
function rowToQuestion(row) {
  const qType = resolveQuestionType(String(row.question_type || '').trim().toLowerCase());

  const question = {
    question_text: String(row.question_text || '').trim(),
    subject: row.subject || null,
    topic: row.topic || null,
    difficulty: String(row.difficulty || 'medium').trim().toLowerCase(),
    marks: Number(row.marks) || 1,
    negative_marks: Number(row.negative_marks) || 0,
    explanation: row.explanation || null,
    question_type: qType,
    word_limit: row.word_limit ? Number(row.word_limit) : null,
    starter_code: row.starter_code || null,
    time_limit_seconds: row.time_limit_seconds ? Number(row.time_limit_seconds) : null,
  };

  if (needsOptions(qType)) {
    const optionTexts = [row.option_1, row.option_2, row.option_3, row.option_4]
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const correctSet = parseCorrectOptions(row.correct_options);
    question.options = optionTexts.map((text, idx) => ({
      option_text: String(text).trim(),
      is_correct: correctSet.has(idx),
    }));
  }

  if (qType === 'coding') {
    question.test_cases = [{
      input: row.test_case_input || '',
      expected_output: row.test_case_output || '',
      is_hidden: false,
    }];
  }

  return question;
}

// Admin: add a question with options
exports.addQuestion = async (req, res) => {
  const { exam_id, question_text, subject, topic, difficulty, marks, negative_marks, explanation, options, question_type, word_limit, starter_code, time_limit_seconds, section_id } = req.body;
  const qType = resolveQuestionType(question_type);

  if (!exam_id || !question_text) {
    return res.status(400).json({ success: false, message: 'exam_id and question_text are required' });
  }
  if (needsOptions(qType) && (!options || options.length < 2)) {
    return res.status(400).json({ success: false, message: 'This question type needs at least 2 options' });
  }
  if (qType === 'true_false' && options.length !== 2) {
    return res.status(400).json({ success: false, message: 'True/False questions need exactly 2 options' });
  }
  if (needsOptions(qType) && !options.some((o) => o.is_correct)) {
    return res.status(400).json({ success: false, message: 'At least one option must be marked correct' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const qResult = await client.query(
      `INSERT INTO questions (exam_id, question_text, subject, topic, difficulty, marks, negative_marks, explanation, question_type, word_limit, starter_code, time_limit_seconds, section_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING question_id`,
      [exam_id, question_text, subject || null, topic || null, difficulty || 'medium', marks || 1,
       negative_marks || 0, explanation || null, qType,
       qType === 'subjective' ? (word_limit || null) : null,
       qType === 'coding' ? (starter_code || null) : null,
       qType === 'coding' ? (time_limit_seconds || 2) : null,
       section_id || null]
    );
    const question_id = qResult.rows[0].question_id;

    if (needsOptions(qType)) {
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, option_order)
           VALUES ($1,$2,$3,$4)`,
          [question_id, opt.option_text, opt.is_correct || false, i + 1]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Question added', question_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Candidate: get questions for an exam (WITHOUT revealing correct answer)
exports.getQuestionsByExam = async (req, res) => {
  const { exam_id } = req.params;
  // attempt_id (sent by the candidate frontend once an attempt has started)
  // seeds the shuffle so the SAME attempt always sees the SAME order, even
  // across a refresh/resume. Without an attempt_id (e.g. admin preview) we
  // fall back to seeding on exam_id alone, so order is still stable per call.
  const { attempt_id } = req.query;

  try {
    const examResult = await pool.query(
      'SELECT randomize_questions, randomize_options FROM exams WHERE exam_id = $1',
      [exam_id]
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const { randomize_questions, randomize_options } = examResult.rows[0];
    const seed = `${exam_id}-${attempt_id || 'preview'}`;

    // Ordered by section first (ungrouped/section_id NULL sorts last), then
    // by question_id within a section — so the candidate sees questions
    // grouped by section without the frontend needing to re-sort anything.
    const questions = await pool.query(
      `SELECT q.question_id, q.question_text, q.subject, q.topic, q.marks, q.question_type,
              q.word_limit, q.starter_code, q.time_limit_seconds,
              q.section_id, s.section_name, COALESCE(s.section_order, 999999) AS section_order
       FROM questions q
       LEFT JOIN exam_sections s ON s.section_id = q.section_id
       WHERE q.exam_id = $1
       ORDER BY section_order ASC, q.question_id ASC`,
      [exam_id]
    );

    let orderedQuestions = questions.rows;
    if (randomize_questions) {
      // Shuffle WITHIN each section only, so section grouping/order (and any
      // section-wise marks/navigation the frontend relies on) stays intact —
      // only the question order inside a section changes per candidate.
      const bySection = {};
      const sectionKeyOrder = [];
      for (const q of orderedQuestions) {
        const key = q.section_id ?? 'none';
        if (!bySection[key]) { bySection[key] = []; sectionKeyOrder.push(key); }
        bySection[key].push(q);
      }
      orderedQuestions = sectionKeyOrder.flatMap((key) =>
        seededShuffle(bySection[key], `${seed}-sec${key}`)
      );
    }

    const questionsWithOptions = await Promise.all(
      orderedQuestions.map(async (q) => {
        if (q.question_type === 'subjective') {
          return { ...q, options: [] };
        }
        if (q.question_type === 'coding') {
          // Only send visible/sample test cases to the candidate; hidden ones stay server-side
          const sampleCases = await pool.query(
            `SELECT test_case_id, input, expected_output FROM coding_test_cases
             WHERE question_id = $1 AND is_hidden = false ORDER BY test_case_id ASC`,
            [q.question_id]
          );
          return { ...q, options: [], sample_test_cases: sampleCases.rows };
        }
        // mcq, true_false, multi_select all use question_options
        const options = await pool.query(
          `SELECT option_id, option_text FROM question_options WHERE question_id = $1 ORDER BY option_order`,
          [q.question_id]
        );
        const orderedOptions = randomize_options
          ? seededShuffle(options.rows, `${seed}-opt${q.question_id}`)
          : options.rows;
        return { ...q, options: orderedOptions };
      })
    );

    res.json({ success: true, questions: questionsWithOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: get one question with full details (correct answers included) for editing
exports.getQuestionByIdAdmin = async (req, res) => {
  const { question_id } = req.params;
  try {
    const qResult = await pool.query(
      `SELECT question_id, exam_id, question_text, subject, topic, difficulty, marks, negative_marks,
              explanation, question_type, word_limit, starter_code, time_limit_seconds, section_id
       FROM questions WHERE question_id = $1`,
      [question_id]
    );
    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    const question = qResult.rows[0];

    question.options = needsOptions(question.question_type)
      ? (await pool.query(
          `SELECT option_id, option_text, is_correct FROM question_options WHERE question_id = $1 ORDER BY option_order`,
          [question_id]
        )).rows
      : [];

    // Let the frontend know whether this question can still have its options
    // edited (see updateQuestion for why this is locked once attempted).
    const attempted = await pool.query('SELECT 1 FROM candidate_answers WHERE question_id = $1 LIMIT 1', [question_id]);
    question.options_locked = attempted.rows.length > 0;

    res.json({ success: true, question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update a question. Text/marks/explanation/etc. can always be edited.
// Options are locked once a candidate has actually answered this question —
// question_options.option_id is referenced by candidate_answers.selected_option_id
// with no ON DELETE rule, so replacing options after an attempt exists would
// either throw a foreign-key error or (if we ever add CASCADE later) silently
// corrupt already-scored results. Blocking this up front keeps results trustworthy.
exports.updateQuestion = async (req, res) => {
  const { question_id } = req.params;
  const { question_text, subject, topic, difficulty, marks, negative_marks, explanation, options, question_type, word_limit, starter_code, time_limit_seconds, section_id } = req.body;

  if (!question_text) {
    return res.status(400).json({ success: false, message: 'question_text is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT question_type FROM questions WHERE question_id = $1', [question_id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const qType = resolveQuestionType(question_type || existing.rows[0].question_type);

    if (needsOptions(qType) && (!options || options.length < 2)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This question type needs at least 2 options' });
    }
    if (qType === 'true_false' && options && options.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'True/False questions need exactly 2 options' });
    }
    if (needsOptions(qType) && options && !options.some((o) => o.is_correct)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'At least one option must be marked correct' });
    }

    const attemptCheck = await client.query('SELECT 1 FROM candidate_answers WHERE question_id = $1 LIMIT 1', [question_id]);
    const alreadyAttempted = attemptCheck.rows.length > 0;

    if (alreadyAttempted && needsOptions(qType)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This question has already been attempted by one or more candidates, so its options are locked to protect their scored results. You can still edit the question text, marks, subject and explanation.',
        locked: 'options',
      });
    }

    await client.query(
      `UPDATE questions
       SET question_text = $1, subject = $2, topic = $3, difficulty = $4, marks = $5,
           negative_marks = $6, explanation = $7, question_type = $8,
           word_limit = $9, starter_code = $10, time_limit_seconds = $11, section_id = $12
       WHERE question_id = $13`,
      [question_text, subject || null, topic || null, difficulty || 'medium', marks || 1,
       negative_marks || 0, explanation || null, qType,
       qType === 'subjective' ? (word_limit || null) : null,
       qType === 'coding' ? (starter_code || null) : null,
       qType === 'coding' ? (time_limit_seconds || 2) : null,
       section_id || null, question_id]
    );

    if (needsOptions(qType) && !alreadyAttempted) {
      await client.query('DELETE FROM question_options WHERE question_id = $1', [question_id]);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, option_order)
           VALUES ($1,$2,$3,$4)`,
          [question_id, opt.option_text, opt.is_correct || false, i + 1]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Question updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Admin: delete a question. Blocked once candidates have answered it — a plain
// DELETE would cascade and wipe their candidate_answers rows too, silently
// changing scores that have already been shown/published.
exports.deleteQuestion = async (req, res) => {
  const { question_id } = req.params;
  try {
    const attemptCheck = await pool.query('SELECT 1 FROM candidate_answers WHERE question_id = $1 LIMIT 1', [question_id]);
    if (attemptCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This question has already been attempted by one or more candidates and cannot be deleted, as it would corrupt their scored results.',
      });
    }

    const result = await pool.query('DELETE FROM questions WHERE question_id = $1 RETURNING question_id', [question_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: bulk add questions (from CSV/Excel parsed on frontend)
exports.bulkAddQuestions = async (req, res) => {
  const { exam_id, questions } = req.body;

  if (!exam_id || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'exam_id and a non-empty questions array are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { addedCount, errors } = await insertQuestionsBulk(client, exam_id, questions);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: `${addedCount} questions added`, added: addedCount, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Admin: bulk-add questions from an uploaded .csv or .xlsx file (multer
// puts the parsed file on req.file as a Buffer — see middleware/uploadSpreadsheet.js).
// Column headers are matched case-insensitively; see downloadBulkTemplate
// for the exact set of columns this expects.
exports.bulkUploadQuestions = async (req, res) => {
  const exam_id = req.body.exam_id || req.query.exam_id;

  if (!exam_id) {
    return res.status(400).json({ success: false, message: 'exam_id is required' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A .csv or .xlsx file is required (form field name: file)' });
  }

  const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
  let rows = [];

  try {
    if (ext === 'csv') {
      rows = await new Promise((resolve, reject) => {
        const results = [];
        Readable.from(req.file.buffer.toString('utf8'))
          .pipe(fastcsv.parse({
            headers: (headers) => headers.map((h) => String(h).trim().toLowerCase().replace(/\s+/g, '_')),
            ignoreEmpty: true,
          }))
          .on('error', reject)
          .on('data', (row) => results.push(row))
          .on('end', () => resolve(results));
      });
    } else {
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error('No worksheet found in file');

      const headerCells = worksheet.getRow(1).values;
      const headers = headerCells.slice(1).map((h) => String(h || '').trim().toLowerCase().replace(/\s+/g, '_'));

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // header row
        const values = row.values.slice(1);
        const obj = {};
        headers.forEach((key, idx) => { obj[key] = values[idx]; });
        // Skip fully blank rows (trailing empty rows are common in exported sheets)
        if (Object.values(obj).some((v) => v !== undefined && v !== null && String(v).trim() !== '')) {
          rows.push(obj);
        }
      });
    }
  } catch (err) {
    return res.status(400).json({ success: false, message: `Could not parse file: ${err.message}` });
  }

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No data rows found in the file' });
  }

  const questions = rows.map(rowToQuestion);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { addedCount, errors } = await insertQuestionsBulk(client, exam_id, questions);
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: `${addedCount} of ${rows.length} rows added`,
      added: addedCount,
      total_rows: rows.length,
      errors,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Admin: download a starter .xlsx with the exact columns bulkUploadQuestions
// expects, plus one filled example row — so the admin doesn't have to guess
// column names.
exports.downloadBulkTemplate = async (req, res) => {
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet('Questions');

  sheet.columns = [
    { header: 'question_text', key: 'question_text', width: 40 },
    { header: 'question_type', key: 'question_type', width: 15 },
    { header: 'subject', key: 'subject', width: 15 },
    { header: 'topic', key: 'topic', width: 15 },
    { header: 'difficulty', key: 'difficulty', width: 12 },
    { header: 'marks', key: 'marks', width: 8 },
    { header: 'negative_marks', key: 'negative_marks', width: 14 },
    { header: 'explanation', key: 'explanation', width: 30 },
    { header: 'option_1', key: 'option_1', width: 20 },
    { header: 'option_2', key: 'option_2', width: 20 },
    { header: 'option_3', key: 'option_3', width: 20 },
    { header: 'option_4', key: 'option_4', width: 20 },
    { header: 'correct_options', key: 'correct_options', width: 15 },
    { header: 'word_limit', key: 'word_limit', width: 12 },
    { header: 'starter_code', key: 'starter_code', width: 20 },
    { header: 'time_limit_seconds', key: 'time_limit_seconds', width: 16 },
    { header: 'test_case_input', key: 'test_case_input', width: 20 },
    { header: 'test_case_output', key: 'test_case_output', width: 20 },
  ];

  sheet.addRow({
    question_text: 'What is 2 + 2?',
    question_type: 'mcq',
    subject: 'Maths',
    topic: 'Arithmetic',
    difficulty: 'easy',
    marks: 1,
    negative_marks: 0,
    explanation: '2 + 2 = 4',
    option_1: '3',
    option_2: '4',
    option_3: '5',
    option_4: '6',
    correct_options: '2', // 1-based → option_2 is correct
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="question-bank-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};
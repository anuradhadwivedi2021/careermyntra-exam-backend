const pool = require('../config/db');
const { logAction } = require('../services/auditLogger');

// ============ PUBLIC: GET ALL CMS SECTIONS (used by admin page to load the list,
//               and can be used by the public site later to render live content) ============
exports.getAllSections = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cms_pages ORDER BY group_name, label'
    );
    res.json({ success: true, sections: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ PUBLIC: GET ONE SECTION (for public site rendering) ============
exports.getSection = async (req, res) => {
  const { section_id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM cms_pages WHERE section_id = $1',
      [section_id]
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

// ============ ADMIN: UPDATE A SECTION ============
exports.updateSection = async (req, res) => {
  const { section_id } = req.params;
  const { heading, body, status } = req.body;

  if (status && !['published', 'draft'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be published or draft' });
  }

  try {
    const result = await pool.query(
      `UPDATE cms_pages SET
        heading = COALESCE($1, heading),
        body = COALESCE($2, body),
        status = COALESCE($3, status),
        updated_at = NOW(),
        updated_by = $4
       WHERE section_id = $5 RETURNING *`,
      [heading, body, status, req.admin?.admin_id || null, section_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    await logAction(req, { action: `Updated "${result.rows[0].label}" content`, module: 'Website content' });
    res.json({ success: true, message: 'Content saved', section: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: ADD A CUSTOM SECTION ============
// Beyond the fixed 10 seeded pages — lets an admin create a new content
// block (e.g. a new landing page or policy) without a developer touching code.
exports.addSection = async (req, res) => {
  const { section_id, label, group_name, heading, body, status } = req.body;

  if (!section_id || !label || !group_name) {
    return res.status(400).json({ success: false, message: 'section_id, label and group_name are required' });
  }
  if (!/^[a-z0-9_-]+$/.test(section_id)) {
    return res.status(400).json({ success: false, message: 'section_id may only contain lowercase letters, numbers, - and _' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cms_pages (section_id, label, group_name, heading, body, status, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [section_id, label, group_name, heading || '', body || '', status || 'draft', req.admin?.admin_id || null]
    );
    await logAction(req, { action: `Created new content section "${label}"`, module: 'Website content' });
    res.status(201).json({ success: true, section: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A section with this section_id already exists' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: DELETE A CUSTOM SECTION ============
exports.deleteSection = async (req, res) => {
  const { section_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cms_pages WHERE section_id = $1 RETURNING label', [section_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    await logAction(req, { action: `Deleted content section "${result.rows[0].label}"`, module: 'Website content' });
    res.json({ success: true, message: 'Section deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
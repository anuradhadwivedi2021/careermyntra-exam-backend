const pool = require('../config/db');
const { logAction } = require('../services/auditLogger');

// Generic helpers shared by all three repeatable-content types below —
// each one is: list (public: published only / admin: all), add, update, delete.

// ============ FAQs ============
exports.listFaqs = async (req, res) => {
  try {
    const isAdmin = !!req.admin;
    const result = await pool.query(
      `SELECT * FROM cms_faqs ${isAdmin ? '' : 'WHERE is_published = TRUE'} ORDER BY sort_order ASC, faq_id ASC`
    );
    res.json({ success: true, faqs: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.addFaq = async (req, res) => {
  const { question, answer, sort_order } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ success: false, message: 'question and answer are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cms_faqs (question, answer, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [question, answer, sort_order || 0]
    );
    logAction(req, { action: `Added FAQ "${question}"`, module: 'Website content' });
    res.status(201).json({ success: true, faq: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.updateFaq = async (req, res) => {
  const { faq_id } = req.params;
  const { question, answer, sort_order, is_published } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM cms_faqs WHERE faq_id = $1', [faq_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    const c = existing.rows[0];
    const result = await pool.query(
      `UPDATE cms_faqs SET question = $1, answer = $2, sort_order = $3, is_published = $4, updated_at = NOW()
       WHERE faq_id = $5 RETURNING *`,
      [question ?? c.question, answer ?? c.answer, sort_order ?? c.sort_order,
       is_published === undefined ? c.is_published : is_published, faq_id]
    );
    res.json({ success: true, faq: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteFaq = async (req, res) => {
  const { faq_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cms_faqs WHERE faq_id = $1 RETURNING faq_id', [faq_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    logAction(req, { action: `Deleted FAQ #${faq_id}`, module: 'Website content' });
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ TESTIMONIALS ============
exports.listTestimonials = async (req, res) => {
  try {
    const isAdmin = !!req.admin;
    const result = await pool.query(
      `SELECT * FROM cms_testimonials ${isAdmin ? '' : 'WHERE is_published = TRUE'} ORDER BY sort_order ASC, testimonial_id ASC`
    );
    res.json({ success: true, testimonials: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.addTestimonial = async (req, res) => {
  const { candidate_name, quote, rating, sort_order } = req.body;
  if (!candidate_name || !quote) {
    return res.status(400).json({ success: false, message: 'candidate_name and quote are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cms_testimonials (candidate_name, quote, rating, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [candidate_name, quote, rating || 5, sort_order || 0]
    );
    logAction(req, { action: `Added testimonial from "${candidate_name}"`, module: 'Website content' });
    res.status(201).json({ success: true, testimonial: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.updateTestimonial = async (req, res) => {
  const { testimonial_id } = req.params;
  const { candidate_name, quote, rating, sort_order, is_published } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM cms_testimonials WHERE testimonial_id = $1', [testimonial_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    const c = existing.rows[0];
    const result = await pool.query(
      `UPDATE cms_testimonials SET candidate_name = $1, quote = $2, rating = $3, sort_order = $4, is_published = $5, updated_at = NOW()
       WHERE testimonial_id = $6 RETURNING *`,
      [candidate_name ?? c.candidate_name, quote ?? c.quote, rating ?? c.rating, sort_order ?? c.sort_order,
       is_published === undefined ? c.is_published : is_published, testimonial_id]
    );
    res.json({ success: true, testimonial: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteTestimonial = async (req, res) => {
  const { testimonial_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cms_testimonials WHERE testimonial_id = $1 RETURNING testimonial_id', [testimonial_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    logAction(req, { action: `Deleted testimonial #${testimonial_id}`, module: 'Website content' });
    res.json({ success: true, message: 'Testimonial deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ BANNERS ============
exports.listBanners = async (req, res) => {
  try {
    const isAdmin = !!req.admin;
    const result = await pool.query(
      `SELECT * FROM cms_banners ${isAdmin ? '' : 'WHERE is_published = TRUE'} ORDER BY sort_order ASC, banner_id ASC`
    );
    res.json({ success: true, banners: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.addBanner = async (req, res) => {
  const { heading, subtext, image_url, link_url, sort_order, starts_at, ends_at } = req.body;
  if (!heading) {
    return res.status(400).json({ success: false, message: 'heading is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cms_banners (heading, subtext, image_url, link_url, sort_order, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [heading, subtext || null, image_url || null, link_url || null, sort_order || 0, starts_at || null, ends_at || null]
    );
    logAction(req, { action: `Added banner "${heading}"`, module: 'Website content' });
    res.status(201).json({ success: true, banner: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.updateBanner = async (req, res) => {
  const { banner_id } = req.params;
  const { heading, subtext, image_url, link_url, sort_order, is_published, starts_at, ends_at } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM cms_banners WHERE banner_id = $1', [banner_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    const c = existing.rows[0];
    const result = await pool.query(
      `UPDATE cms_banners SET heading = $1, subtext = $2, image_url = $3, link_url = $4, sort_order = $5,
        is_published = $6, starts_at = $7, ends_at = $8, updated_at = NOW()
       WHERE banner_id = $9 RETURNING *`,
      [heading ?? c.heading, subtext ?? c.subtext, image_url ?? c.image_url, link_url ?? c.link_url,
       sort_order ?? c.sort_order, is_published === undefined ? c.is_published : is_published,
       starts_at ?? c.starts_at, ends_at ?? c.ends_at, banner_id]
    );
    res.json({ success: true, banner: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteBanner = async (req, res) => {
  const { banner_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cms_banners WHERE banner_id = $1 RETURNING banner_id', [banner_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    logAction(req, { action: `Deleted banner #${banner_id}`, module: 'Website content' });
    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
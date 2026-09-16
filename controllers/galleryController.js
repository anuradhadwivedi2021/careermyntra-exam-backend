const pool = require('../config/db');

// Public + Admin: list gallery images.
// Public visitors (no valid admin token) only ever see published images.
// A logged-in admin (req.admin set by optionalAdmin) sees everything,
// including hidden ones, so the admin panel can manage them.
exports.listImages = async (req, res) => {
  try {
    const isAdmin = !!req.admin;
    const result = await pool.query(
      `SELECT gallery_id, title, image_url, media_type, is_published, sort_order, created_at
       FROM gallery
       ${isAdmin ? '' : 'WHERE is_published = TRUE'}
       ORDER BY sort_order ASC, created_at DESC`
    );
    res.json({ success: true, images: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: add image or video link
exports.addImage = async (req, res) => {
  const { title, image_url, media_type } = req.body;
  const admin_id = req.admin.admin_id;

  if (!title || !image_url) {
    return res.status(400).json({ success: false, message: 'title and image_url are required' });
  }
  if (media_type && !['image', 'video'].includes(media_type)) {
    return res.status(400).json({ success: false, message: "media_type must be 'image' or 'video'" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO gallery (title, image_url, media_type, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, image_url, media_type || 'image', admin_id]
    );
    res.status(201).json({ success: true, image: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update (toggle publish, edit title/url/type/order)
exports.updateImage = async (req, res) => {
  const { gallery_id } = req.params;
  const { title, image_url, media_type, is_published, sort_order } = req.body;

  if (media_type && !['image', 'video'].includes(media_type)) {
    return res.status(400).json({ success: false, message: "media_type must be 'image' or 'video'" });
  }

  try {
    const existing = await pool.query('SELECT * FROM gallery WHERE gallery_id = $1', [gallery_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    const current = existing.rows[0];

    const result = await pool.query(
      `UPDATE gallery SET
        title = $1, image_url = $2, media_type = $3, is_published = $4, sort_order = $5, updated_at = NOW()
       WHERE gallery_id = $6 RETURNING *`,
      [
        title ?? current.title,
        image_url ?? current.image_url,
        media_type ?? current.media_type,
        is_published === undefined ? current.is_published : is_published,
        sort_order === undefined ? current.sort_order : sort_order,
        gallery_id,
      ]
    );
    res.json({ success: true, image: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: delete
exports.deleteImage = async (req, res) => {
  const { gallery_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM gallery WHERE gallery_id = $1 RETURNING gallery_id', [gallery_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
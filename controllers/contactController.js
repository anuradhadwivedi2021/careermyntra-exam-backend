const pool = require('../config/db');

// Public: candidate/visitor submits the Contact Us form
exports.submitMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }

  try {
    await pool.query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)`,
      [name.trim(), email.trim(), subject.trim(), message.trim()]
    );
    // NOTE: this only saves the message to the database. It does not send
    // a real email/SMS notification yet — no email provider is wired up
    // in this project. Add that later if you want an alert on submission.
    res.json({ success: true, message: 'Message sent — we will get back to you soon.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list all contact messages, newest first
exports.listMessages = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM contact_messages ORDER BY created_at DESC'
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: mark a message as read/resolved
exports.updateStatus = async (req, res) => {
  const { message_id } = req.params;
  const { status } = req.body;

  if (!['new', 'read', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      `UPDATE contact_messages SET status = $1 WHERE message_id = $2 RETURNING *`,
      [status, message_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
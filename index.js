const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const questionRoutes = require('./routes/questionRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const pool = require('./config/db');
const reportRoutes = require('./routes/reportRoutes');
const app = express();
const adminAuthRoutes = require('./routes/adminAuthRoutes');

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());


// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CareerMyntra Exam Backend is running' });
});

// Database test route
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// Exam & Question routes
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/admin-auth', adminAuthRoutes);

// Attempt routes
app.use('/api/attempts', attemptRoutes);
app.use('/api/reports', reportRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
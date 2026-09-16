const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const uploadRoutes = require('./routes/uploadRoutes');
const cmsContentRoutes = require('./routes/cmsContentRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const couponRoutes = require('./routes/couponRoutes');
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const questionRoutes = require('./routes/questionRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const pool = require('./config/db');
const reportRoutes = require('./routes/reportRoutes');
const app = express();
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const studentRoutes = require('./routes/studentRoutes');
const codingRoutes = require('./routes/codingRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const cmsRoutes = require('./routes/cmsRoutes');
const roleRoutes = require('./routes/roleRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const proctoringRoutes = require('./routes/proctoringRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationLogRoutes = require('./routes/notificationLogRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const pricingPlanRoutes = require('./routes/pricingPlanRoutes');


// Core middleware MUST come before any route is mounted,
// otherwise those routes get no CORS headers and no parsed JSON body.
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Uploaded images: served as static files. helmet's default
// cross-origin-resource-policy blocks the frontend (different origin) from
// loading these <img> sources, so it's relaxed for just this folder.
app.use('/uploads', (req, res, next) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// General rate limiter — applies to all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Stricter limiter for login/OTP/password routes — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again after some time.' },
});
app.use('/api/auth', authLimiter);
app.use('/api/admin-auth', authLimiter);

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
app.use('/api/cms', cmsContentRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/contact', contactRoutes);
// Exam & Question routes
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/admin-auth', adminAuthRoutes);

// Attempt routes
app.use('/api/attempts', attemptRoutes);
app.use('/api/reports', reportRoutes);

// Exam registration routes
app.use('/api/registrations', registrationRoutes);

// Payment routes
app.use('/api/payments', paymentRoutes);

// File uploads (gallery images, branding logo/favicon)
app.use('/api/upload', uploadRoutes);

// Gallery routes
app.use('/api/gallery', galleryRoutes);

// Coupon routes
app.use('/api/coupons', couponRoutes);

// Admin: student management
app.use('/api/students', studentRoutes);

// Admin: coding question test cases
app.use('/api/coding', codingRoutes);
app.use('/api/contact-messages', contactRoutes);

// Settings: general + branding
app.use('/api/settings', settingsRoutes);

// CMS / Roles / Audit / Proctoring
app.use('/api/roles', roleRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/proctoring', proctoringRoutes);

// Exam sections (section-wise navigation)
app.use('/api/sections', sectionRoutes);
app.use('/api/notification-logs', notificationLogRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/pricing-plans', pricingPlanRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
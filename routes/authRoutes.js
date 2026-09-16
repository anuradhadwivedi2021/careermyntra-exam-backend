const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyCandidate } = require('../middleware/auth');

router.get('/test', authController.testRoute);
router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOtp);
router.post('/send-email-otp', authController.sendEmailOtpToCandidate);
router.post('/verify-email-otp', authController.verifyEmailOtp);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/profile', verifyCandidate, authController.getProfile);
router.put('/profile', verifyCandidate, authController.updateProfile);
router.post('/logout', verifyCandidate, authController.logout);

module.exports = router;
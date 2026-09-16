const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { verifyAdmin, verifyCandidate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.post('/image', verifyAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      // multer errors (bad file type, too large) land here instead of the
      // normal Express error handler
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, uploadController.uploadImage);

router.post('/candidate-photo', verifyCandidate, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, uploadController.uploadImage);

module.exports = router;
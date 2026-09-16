const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const { verifyAdmin, optionalAdmin } = require('../middleware/auth');

router.get('/', optionalAdmin, galleryController.listImages);
router.post('/', verifyAdmin, galleryController.addImage);
router.patch('/:gallery_id', verifyAdmin, galleryController.updateImage);
router.delete('/:gallery_id', verifyAdmin, galleryController.deleteImage);

module.exports = router;
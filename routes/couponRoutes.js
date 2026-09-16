const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/admin/all', verifyAdmin, couponController.listCoupons);
router.post('/', verifyAdmin, couponController.createCoupon);
router.patch('/:coupon_id', verifyAdmin, couponController.updateCoupon);
router.delete('/:coupon_id', verifyAdmin, couponController.deleteCoupon);

module.exports = router;
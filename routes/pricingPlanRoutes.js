const express = require('express');
const router = express.Router();
const pricingPlanController = require('../controllers/pricingPlanController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/', pricingPlanController.getPublicPlans);
router.get('/admin/all', verifyAdmin, pricingPlanController.getAllPlans);
router.post('/', verifyAdmin, pricingPlanController.createPlan);
router.patch('/:plan_id', verifyAdmin, pricingPlanController.updatePlan);
router.delete('/:plan_id', verifyAdmin, pricingPlanController.deletePlan);

module.exports = router;
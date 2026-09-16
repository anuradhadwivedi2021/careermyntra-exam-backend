const express = require('express');
const router = express.Router();
const cms = require('../controllers/cmsContentController');
const { verifyAdmin } = require('../middleware/auth');

// FAQs
router.get('/faqs', cms.listFaqs);
router.get('/faqs/all', verifyAdmin, cms.listFaqs);
router.post('/faqs', verifyAdmin, cms.addFaq);
router.put('/faqs/:faq_id', verifyAdmin, cms.updateFaq);
router.delete('/faqs/:faq_id', verifyAdmin, cms.deleteFaq);

// Testimonials
router.get('/testimonials', cms.listTestimonials);
router.get('/testimonials/all', verifyAdmin, cms.listTestimonials);
router.post('/testimonials', verifyAdmin, cms.addTestimonial);
router.put('/testimonials/:testimonial_id', verifyAdmin, cms.updateTestimonial);
router.delete('/testimonials/:testimonial_id', verifyAdmin, cms.deleteTestimonial);

// Banners
router.get('/banners', cms.listBanners);
router.get('/banners/all', verifyAdmin, cms.listBanners);
router.post('/banners', verifyAdmin, cms.addBanner);
router.put('/banners/:banner_id', verifyAdmin, cms.updateBanner);
router.delete('/banners/:banner_id', verifyAdmin, cms.deleteBanner);

module.exports = router;
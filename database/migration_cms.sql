-- ============================================
-- CareerMyntra Exam Portal - CMS (Website Content) Migration
-- Run this once on your existing database
-- ============================================

CREATE TABLE IF NOT EXISTS cms_pages (
    section_id VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    group_name VARCHAR(50) NOT NULL,
    heading VARCHAR(300) DEFAULT '',
    body TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'draft')),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES admins(admin_id)
);

-- Seed the 10 sections used on the frontend CMS page, with the same
-- placeholder content that currently lives hardcoded in app/admin/cms/page.tsx
INSERT INTO cms_pages (section_id, label, group_name, heading, body, status) VALUES
    ('home', 'Home page', 'Pages',
        'Test your skills. Discover your potential. Build your career.',
        'CareerMyntra brings mock tests, aptitude assessments and coding rounds into one timed exam experience.',
        'published'),
    ('about', 'About us', 'Pages',
        'About CareerMyntra',
        'CareerMyntra helps candidates prepare for entrance exams, recruitment assessments and skill tests.',
        'published'),
    ('contact', 'Contact us', 'Pages',
        'Get in touch',
        'support@careermyntra.com · +91 98765 43210',
        'published'),
    ('faqs', 'FAQs', 'Pages',
        'Frequently asked questions',
        E'How do I register for an exam?\nHow are results calculated?',
        'published'),
    ('terms', 'Terms & conditions', 'Legal',
        'Terms & conditions',
        'By using CareerMyntra, you agree to the following terms…',
        'published'),
    ('privacy', 'Privacy policy', 'Legal',
        'Privacy policy',
        'We collect and use your data as described below…',
        'published'),
    ('refund', 'Refund policy', 'Legal',
        'Refund policy',
        'Paid test series may be refunded within 48 hours of purchase…',
        'published'),
    ('banners', 'Banners', 'Marketing',
        'Homepage banner',
        'Diwali offer — 30% off all test series, ends Nov 15.',
        'published'),
    ('testimonials', 'Testimonials', 'Marketing',
        'Featured testimonial',
        '"CareerMyntra''s mock tests matched the real exam pattern perfectly." — Priya S.',
        'published'),
    ('footer', 'Footer content', 'Site',
        'Footer tagline',
        'Career Aptitude Test | Admission Guidance | Training | Internship | Jobs',
        'published')
ON CONFLICT (section_id) DO NOTHING;
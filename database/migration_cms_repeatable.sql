-- ============================================
-- CareerMyntra Exam Portal - CMS Repeatable Content Migration
-- Splits FAQs / Testimonials / Banners out of the single cms_pages
-- text blob into proper structured, repeatable lists.
-- Run this once on your existing database
-- ============================================

CREATE TABLE IF NOT EXISTS cms_faqs (
    faq_id SERIAL PRIMARY KEY,
    question VARCHAR(300) NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_testimonials (
    testimonial_id SERIAL PRIMARY KEY,
    candidate_name VARCHAR(150) NOT NULL,
    quote TEXT NOT NULL,
    rating SMALLINT DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    sort_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_banners (
    banner_id SERIAL PRIMARY KEY,
    heading VARCHAR(200) NOT NULL,
    subtext VARCHAR(300),
    image_url TEXT,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Migrate whatever was in the old single-blob sections into the first row
-- of each new table, so existing content isn't lost. Safe to skip/ignore
-- if those tables already have rows.
INSERT INTO cms_faqs (question, answer, sort_order)
SELECT 'How do I register for an exam?', body, 0
FROM cms_pages WHERE section_id = 'faqs' AND NOT EXISTS (SELECT 1 FROM cms_faqs);

INSERT INTO cms_testimonials (candidate_name, quote, sort_order)
SELECT 'Priya S.', body, 0
FROM cms_pages WHERE section_id = 'testimonials' AND NOT EXISTS (SELECT 1 FROM cms_testimonials);

INSERT INTO cms_banners (heading, subtext, sort_order)
SELECT heading, body, 0
FROM cms_pages WHERE section_id = 'banners' AND NOT EXISTS (SELECT 1 FROM cms_banners);
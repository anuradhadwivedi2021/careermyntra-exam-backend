CREATE TABLE IF NOT EXISTS pricing_plans (
  plan_id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price VARCHAR(30) NOT NULL,              -- e.g. '₹0', '₹99', 'Custom'
  blurb TEXT,
  features JSONB NOT NULL DEFAULT '[]',    -- array of strings
  highlighted BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO pricing_plans (name, price, blurb, features, highlighted, sort_order)
VALUES
  ('Free Test', '₹0', 'One full-length mock test to see how the platform works.',
   '["1 free exam attempt", "Basic performance report", "No card required"]', FALSE, 1),
  ('Individual Test', '₹99', 'Pay per exam — ideal if you only need one or two assessments.',
   '["Any single exam", "Full performance report", "Unlimited attempts on that exam"]', TRUE, 2),
  ('Test Series', '₹499', 'A full series with detailed, question-wise performance reports.',
   '["Full exam series access", "Question-wise analysis", "Priority support"]', FALSE, 3)
ON CONFLICT DO NOTHING;
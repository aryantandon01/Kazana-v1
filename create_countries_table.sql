-- Create countries table for standardized country list
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE, -- ISO country code (optional)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert countries (major tech hubs and common countries)
INSERT INTO countries (name, code) VALUES
  ('United States', 'US'),
  ('Canada', 'CA'),
  ('United Kingdom', 'GB'),
  ('Germany', 'DE'),
  ('France', 'FR'),
  ('Netherlands', 'NL'),
  ('Switzerland', 'CH'),
  ('Sweden', 'SE'),
  ('Denmark', 'DK'),
  ('Norway', 'NO'),
  ('Finland', 'FI'),
  ('Ireland', 'IE'),
  ('Spain', 'ES'),
  ('Italy', 'IT'),
  ('Poland', 'PL'),
  ('Portugal', 'PT'),
  ('Belgium', 'BE'),
  ('Austria', 'AT'),
  ('Czech Republic', 'CZ'),
  ('India', 'IN'),
  ('China', 'CN'),
  ('Japan', 'JP'),
  ('South Korea', 'KR'),
  ('Singapore', 'SG'),
  ('Australia', 'AU'),
  ('New Zealand', 'NZ'),
  ('Israel', 'IL'),
  ('United Arab Emirates', 'AE'),
  ('Brazil', 'BR'),
  ('Mexico', 'MX'),
  ('Argentina', 'AR'),
  ('Chile', 'CL'),
  ('Colombia', 'CO'),
  ('South Africa', 'ZA'),
  ('Nigeria', 'NG'),
  ('Kenya', 'KE'),
  ('Egypt', 'EG'),
  ('Turkey', 'TR'),
  ('Russia', 'RU'),
  ('Ukraine', 'UA'),
  ('Romania', 'RO'),
  ('Bulgaria', 'BG'),
  ('Greece', 'GR'),
  ('Hungary', 'HU'),
  ('Croatia', 'HR'),
  ('Estonia', 'EE'),
  ('Latvia', 'LV'),
  ('Lithuania', 'LT'),
  ('Slovakia', 'SK'),
  ('Slovenia', 'SI'),
  ('Luxembourg', 'LU'),
  ('Malta', 'MT'),
  ('Cyprus', 'CY'),
  ('Iceland', 'IS'),
  ('Thailand', 'TH'),
  ('Vietnam', 'VN'),
  ('Philippines', 'PH'),
  ('Indonesia', 'ID'),
  ('Malaysia', 'MY'),
  ('Taiwan', 'TW'),
  ('Hong Kong', 'HK'),
  ('Bangladesh', 'BD'),
  ('Pakistan', 'PK'),
  ('Sri Lanka', 'LK'),
  ('Nepal', 'NP')
ON CONFLICT (name) DO NOTHING;

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_countries_name ON countries(name);

-- Verify the data
SELECT COUNT(*) as total_countries FROM countries;


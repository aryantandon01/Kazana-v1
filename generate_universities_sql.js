// Script to generate SQL INSERT statements from world_universities_and_domains.json
// Run with: node generate_universities_sql.js > create_universities_table.sql

const fs = require('fs');

const jsonData = JSON.parse(fs.readFileSync('world_universities_and_domains.json', 'utf8'));

console.log(`-- Create universities table for standardized university list
-- Run this in your Supabase SQL Editor
-- Generated from world_universities_and_domains.json

CREATE TABLE IF NOT EXISTS universities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  country TEXT, -- Optional: link to countries table
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert universities from JSON file
INSERT INTO universities (name, country) VALUES`);

const seen = new Set();
let count = 0;

jsonData.forEach((uni, index) => {
  if (!uni.name || !uni.country) return;
  
  // Create unique key to avoid duplicates
  const key = `${uni.name}|${uni.country}`;
  if (seen.has(key)) return;
  seen.add(key);
  
  // Escape single quotes in names
  const name = uni.name.replace(/'/g, "''");
  const country = uni.country.replace(/'/g, "''");
  
  const comma = count > 0 ? ',' : '';
  console.log(`${comma}  ('${name}', '${country}')`);
  count++;
});

console.log(`ON CONFLICT (name) DO NOTHING;

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_universities_name ON universities(name);

-- Verify the data
SELECT COUNT(*) as total_universities FROM universities;
SELECT COUNT(DISTINCT country) as total_countries FROM universities;`);

console.error(`\nProcessed ${count} unique universities from ${jsonData.length} entries.`);


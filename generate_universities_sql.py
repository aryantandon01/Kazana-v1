#!/usr/bin/env python3
"""
Script to generate SQL INSERT statements from world_universities_and_domains.json
Run with: python3 generate_universities_sql.py > create_universities_table.sql
"""

import json

# Read the JSON file
with open('world_universities_and_domains.json', 'r', encoding='utf-8') as f:
    universities = json.load(f)

print("""-- Create universities table for standardized university list
-- Run this in your Supabase SQL Editor
-- Generated from world_universities_and_domains.json

CREATE TABLE IF NOT EXISTS universities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  country TEXT, -- Optional: link to countries table
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert universities from JSON file
INSERT INTO universities (name, country) VALUES""")

seen = set()
count = 0

for uni in universities:
    if not uni.get('name') or not uni.get('country'):
        continue
    
    # Create unique key to avoid duplicates (same name + country)
    key = (uni['name'], uni['country'])
    if key in seen:
        continue
    seen.add(key)
    
    # Escape single quotes in SQL
    name = uni['name'].replace("'", "''")
    country = uni['country'].replace("'", "''")
    
    comma = ',' if count > 0 else ''
    print(f"{comma}  ('{name}', '{country}')")
    count += 1

print("""ON CONFLICT (name) DO NOTHING;

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_universities_name ON universities(name);

-- Verify the data
SELECT COUNT(*) as total_universities FROM universities;
SELECT COUNT(DISTINCT country) as total_countries FROM universities;""")

print(f"\n-- Processed {count} unique universities from {len(universities)} entries.", file=__import__('sys').stderr)


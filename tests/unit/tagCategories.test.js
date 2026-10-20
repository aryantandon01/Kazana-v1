import { describe, it, expect } from 'vitest';
import {
  TAG_LEXICON,
  TAG_CATEGORIES,
  resolveTagCategory,
} from '../../scripts/ingestion/classification/catalog.js';
import { buildProjection } from '../../scripts/ingestion/extraction/project.js';

// Mirrors tags_tag_category_check in
// db/migrations/20260719090000_semantic_facets_tags.sql.
const DB_ALLOWED_CATEGORIES = [
  'programming_language',
  'framework',
  'cloud',
  'ai',
  'infrastructure',
  'database',
  'soft_skill',
  'domain',
  'tool',
  'other',
];

describe('tag category taxonomy', () => {
  it('keeps the code taxonomy in sync with the DB CHECK constraint', () => {
    expect([...TAG_CATEGORIES].sort()).toEqual([...DB_ALLOWED_CATEGORIES].sort());
  });

  it('only assigns DB-allowed categories to lexicon entries', () => {
    for (const entry of TAG_LEXICON) {
      expect(DB_ALLOWED_CATEGORIES).toContain(entry.category);
    }
  });

  it('resolves known skill/technology names to lexicon categories', () => {
    expect(resolveTagCategory('Python')).toBe('programming_language');
    expect(resolveTagCategory('TypeScript')).toBe('programming_language');
    expect(resolveTagCategory('React')).toBe('framework');
    expect(resolveTagCategory('Next.js')).toBe('framework');
    expect(resolveTagCategory('Node.js')).toBe('framework');
    expect(resolveTagCategory('AWS')).toBe('cloud');
    expect(resolveTagCategory('Kubernetes')).toBe('infrastructure');
    expect(resolveTagCategory('PostgreSQL')).toBe('database');
    expect(resolveTagCategory('PyTorch')).toBe('ai');
    expect(resolveTagCategory('Communication')).toBe('soft_skill');
    expect(resolveTagCategory('Distributed Systems')).toBe('domain');
  });

  it('falls back to `other` for names outside the lexicon', () => {
    expect(resolveTagCategory('gRPC')).toBe('other');
    expect(resolveTagCategory('Stakeholder Management')).toBe('other');
    expect(resolveTagCategory('')).toBe('other');
    expect(resolveTagCategory(null)).toBe('other');
    expect(resolveTagCategory(undefined)).toBe('other');
  });
});

describe('extraction tag projection', () => {
  const result = {
    canonical: {
      title: 'Senior Backend Engineer',
      company: 'Acme',
      requiredSkills: ['Python', 'Unknown Skill'],
      preferredSkills: ['Communication', 'gRPC'],
      technologies: ['Kubernetes', 'Unlisted Tool'],
      careerAreas: ['backend'],
      experienceLevel: 'senior',
      employmentType: 'full_time',
      workArrangement: 'remote',
    },
    extraction: {},
  };

  it('emits only DB-allowed tag categories', () => {
    const projection = buildProjection(result);
    const tags = [...projection.tags.employer, ...projection.tags.ai];

    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(DB_ALLOWED_CATEGORIES).toContain(tag.tag_category);
    }
  });

  it('maps known names and defaults unknown ones to `other`', () => {
    const projection = buildProjection(result);
    const tags = [...projection.tags.employer, ...projection.tags.ai];
    const byName = new Map(tags.map((tag) => [tag.tag_name, tag.tag_category]));

    expect(byName.get('Python')).toBe('programming_language');
    expect(byName.get('Kubernetes')).toBe('infrastructure');
    expect(byName.get('Communication')).toBe('soft_skill');
    expect(byName.get('Unknown Skill')).toBe('other');
    expect(byName.get('gRPC')).toBe('other');
    expect(byName.get('Unlisted Tool')).toBe('other');
  });
});

import { describe, it, expect } from 'vitest';
import { REPORT_LEVELS, REPORT_LEVEL_OPTIONS } from '@/constants/reportLevels';
import {
  OUTCOME_LABELS,
  getConfidenceTone,
  formatReportDate,
  buildReportMetaItems,
} from '@/lib/reports/presentation';

describe('report level vocabulary', () => {
  it('exposes the L1–L9 bands once, in order', () => {
    expect(REPORT_LEVELS).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']);
  });

  it('derives select options from the same bands so the form and filters cannot drift', () => {
    expect(REPORT_LEVEL_OPTIONS).toHaveLength(REPORT_LEVELS.length);
    expect(REPORT_LEVEL_OPTIONS[0]).toEqual({ value: 'L1', label: 'L1' });
    expect(REPORT_LEVEL_OPTIONS.map((option) => option.value)).toEqual(REPORT_LEVELS);
  });
});

describe('buildReportMetaItems', () => {
  it('surfaces level and country when present', () => {
    expect(buildReportMetaItems({ level: 'L5', country: 'India' })).toEqual([
      { label: 'Level', value: 'L5' },
      { label: 'Country', value: 'India' },
    ]);
  });

  it('omits empty fields instead of emitting blank rows', () => {
    expect(buildReportMetaItems({})).toEqual([]);
    expect(buildReportMetaItems({ level: 'L3', difficulty: null, outcome: null })).toEqual([
      { label: 'Level', value: 'L3' },
    ]);
  });

  it('labels difficulty and outcome for humans', () => {
    expect(buildReportMetaItems({ difficulty: 4, outcome: 'offer' })).toEqual([
      { label: 'Difficulty', value: '4/5' },
      { label: 'Outcome', value: OUTCOME_LABELS.offer },
    ]);
  });
});

describe('confidence tone', () => {
  it('falls back to the low tone when confidence is missing', () => {
    expect(getConfidenceTone(undefined)).toBe(getConfidenceTone({ level: 'low' }));
    expect(getConfidenceTone({ level: 'high' }).label).toBe('High confidence');
  });
});

describe('formatReportDate', () => {
  it('returns an empty string for missing or invalid dates', () => {
    expect(formatReportDate(null)).toBe('');
    expect(formatReportDate('not-a-date')).toBe('');
  });

  it('formats a valid ISO date', () => {
    expect(formatReportDate('2026-03-04T00:00:00.000Z')).toMatch(/2026/);
  });
});

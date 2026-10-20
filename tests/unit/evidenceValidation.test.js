import { describe, it, expect } from 'vitest';
import {
  classifyEvidence,
  earnsEvidenceBonus,
  isPlausibleEmail,
  normalizeEvidence,
  EVIDENCE_STATUS,
} from '@/lib/assessment/evidenceValidation';

describe('evidence normalization', () => {
  it('coerces null/undefined to an empty string', () => {
    expect(normalizeEvidence(null)).toBe('');
    expect(normalizeEvidence(undefined)).toBe('');
  });

  it('trims and collapses internal whitespace', () => {
    expect(normalizeEvidence('  test@example.com  ')).toBe('test@example.com');
    expect(normalizeEvidence('Interview    Invitation\n\nGoogle')).toBe('Interview Invitation Google');
  });
});

describe('email structure', () => {
  it('accepts plausible addresses', () => {
    expect(isPlausibleEmail('test@example.com')).toBe(true);
    expect(isPlausibleEmail('candidate@example.com')).toBe(true);
    expect(isPlausibleEmail('Test@Example.COM')).toBe(true);
    expect(isPlausibleEmail('  test@example.com  ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isPlausibleEmail('test@@example.com')).toBe(false);
    expect(isPlausibleEmail('test@example')).toBe(false); // no TLD
    expect(isPlausibleEmail('test@.com')).toBe(false);
    expect(isPlausibleEmail('@example.com')).toBe(false);
    expect(isPlausibleEmail('test example@mail.com')).toBe(false); // embedded space
    expect(isPlausibleEmail('x')).toBe(false);
  });
});

describe('classifyEvidence — three tiers', () => {
  it('treats empty / whitespace-only input as "none"', () => {
    for (const input of [undefined, null, '', '   ', '\n\t ']) {
      const result = classifyEvidence(input);
      expect(result.status).toBe(EVIDENCE_STATUS.NONE);
      expect(result.kind).toBeNull();
    }
  });

  it('rejects arbitrary short strings as "invalid" (no bonus)', () => {
    for (const input of ['x', 'X ', 'hello', 'test', 'aaaa', '12345']) {
      const result = classifyEvidence(input);
      expect(result.status).toBe(EVIDENCE_STATUS.INVALID);
      expect(earnsEvidenceBonus(result)).toBe(false);
    }
  });

  it('rejects malformed email-shaped input as "invalid"', () => {
    for (const input of ['test@@example.com', 'test@example', 'test@.com', 'nope@']) {
      const result = classifyEvidence(input);
      expect(result.status).toBe(EVIDENCE_STATUS.INVALID);
      expect(earnsEvidenceBonus(result)).toBe(false);
    }
  });

  it('accepts plausible email addresses as "plausible" evidence', () => {
    for (const input of ['test@example.com', 'candidate@example.com', ' Test@Example.com ']) {
      const result = classifyEvidence(input);
      expect(result.status).toBe(EVIDENCE_STATUS.PLAUSIBLE);
      expect(result.kind).toBe('email');
      expect(earnsEvidenceBonus(result)).toBe(true);
    }
  });

  it('accepts a substantial reference (subject line) as "plausible"', () => {
    const result = classifyEvidence('Interview Invitation — Google, Software Engineer');
    expect(result.status).toBe(EVIDENCE_STATUS.PLAUSIBLE);
    expect(result.kind).toBe('reference');
    expect(earnsEvidenceBonus(result)).toBe(true);
  });

  it('still rejects a short reference that lacks enough detail', () => {
    const result = classifyEvidence('Google invite');
    expect(result.status).toBe(EVIDENCE_STATUS.INVALID);
    expect(earnsEvidenceBonus(result)).toBe(false);
  });

  it('never awards the bonus for a non-empty string simply because it exists', () => {
    expect(earnsEvidenceBonus(classifyEvidence('x'))).toBe(false);
    expect(earnsEvidenceBonus(classifyEvidence('hello'))).toBe(false);
    expect(earnsEvidenceBonus(classifyEvidence('   '))).toBe(false);
  });
});

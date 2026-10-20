import { describe, it, expect } from 'vitest';
import {
  roleFamilyCompatibility,
  ROLE_COMPATIBILITY,
} from '@/lib/matching/eligibility';

describe('role family compatibility', () => {
  it('treats the same family as direct', () => {
    expect(roleFamilyCompatibility('software_engineer', 'software_engineer')).toBe(
      ROLE_COMPATIBILITY.DIRECT,
    );
  });

  it('treats adjacent clusters as pursuable, not incompatible', () => {
    expect(roleFamilyCompatibility('software_engineer', 'ai_engineer')).toBe(
      ROLE_COMPATIBILITY.ADJACENT,
    );
    expect(roleFamilyCompatibility('software_engineer', 'data_scientist')).toBe(
      ROLE_COMPATIBILITY.ADJACENT,
    );
    expect(roleFamilyCompatibility('data_engineer', 'data_scientist')).toBe(
      ROLE_COMPATIBILITY.ADJACENT,
    );
  });

  it('keeps engineering vs product/design incompatible', () => {
    expect(roleFamilyCompatibility('software_engineer', 'product_manager')).toBe(
      ROLE_COMPATIBILITY.INCOMPATIBLE,
    );
    expect(roleFamilyCompatibility('software_engineer', 'product_designer')).toBe(
      ROLE_COMPATIBILITY.INCOMPATIBLE,
    );
  });

  it('keeps the engineering IC ↔ management cross weak', () => {
    expect(roleFamilyCompatibility('software_engineer', 'engineering_manager')).toBe(
      ROLE_COMPATIBILITY.WEAK,
    );
  });

  it('keeps unrelated non-engineering families incompatible', () => {
    expect(roleFamilyCompatibility('account_executive', 'recruiter')).toBe(
      ROLE_COMPATIBILITY.INCOMPATIBLE,
    );
  });

  it('falls back to weak when a family is unknown', () => {
    expect(roleFamilyCompatibility('not_a_family', 'software_engineer')).toBe(
      ROLE_COMPATIBILITY.WEAK,
    );
    expect(roleFamilyCompatibility(null, 'software_engineer')).toBe(ROLE_COMPATIBILITY.WEAK);
  });
});

/**
 * Configurable recommendation weights.
 * Tune without changing signal implementations.
 *
 * Extension: add keys here + a signal in signals.js.
 */
export const DEFAULT_WEIGHTS = {
  /** Co-primary with experience */
  skills: 0.24,
  /** Dominant — experience gaps are gated */
  experience: 0.36,
  career_areas: 0.12,
  /** Graduated: city 100% / country 80% / continent 25% / else 0% */
  location: 0.12,
  semantic: 0.08,
  /** New: explicit job-family proximity (58 families from JOB_FAMILY_GROUPS) */
  job_family: 0.08,
};

export const EXPERIENCE_GATING_THRESHOLD = 0.25;
export const EXPERIENCE_GATING_MULTIPLIER = 0.6;

/** Soft boosts applied after base score (not part of weighted sum). */
export const RANKING_BOOSTS = {
  freshness_new: 0.08,
  freshness_updated: 0.04,
};

export const DEFAULT_MIN_SCORE = 0.5;

import { JOB_FAMILY_GROUPS } from '../../constants/jobFamilies.js';

/** Domain clusters derived from the canonical JOB_FAMILY_GROUPS (58 families). */
export const FAMILY_CLUSTERS = Object.fromEntries(
  JOB_FAMILY_GROUPS.flatMap((g) =>
    g.options.map((o) => [o.value, g.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')])
  )
);

/** Adjacent categories soften the cross-category penalty for related domains. */
export const ADJACENT_CATEGORIES = [
  ['technology', 'ai_research'],
  ['technology', 'data_analytics'],
  ['data_analytics', 'finance'],
  ['quantitative', 'finance'],
  ['technology', 'hardware'],
  ['product_design', 'technology'],
];
export const ADJACENT_SCORE = 0.6;
export const IC_CATEGORIES = new Set([
  'technology', 'ai_research', 'data_analytics', 'finance', 'quantitative', 'hardware',
]);
export const FAMILY_SCORES = {
  exactMatch: 1.0,
  sameClusterSameType: 0.8,
  sameClusterMixedType: 0.7,
  differentClusterSameType: 0.5,
  crossDomain: 0.4,
  crossCategory: 0.25,
  unrelated: 0.05,
};

/** Job family → likely skills (proxy until resume skills are first-class). */
export const FAMILY_SKILL_PRIORS = {
  software_engineer: ['python', 'javascript', 'typescript', 'react', 'sql', 'aws', 'docker', 'kubernetes', 'go'],
  ai_engineer: ['python', 'llms', 'pytorch', 'tensorflow', 'aws', 'rag', 'langchain', 'vector-databases'],
  machine_learning_engineer: ['python', 'pytorch', 'tensorflow', 'sql', 'aws', 'cuda', 'kubernetes'],
  data_engineer: ['python', 'sql', 'spark', 'aws', 'airflow', 'kafka', 'snowflake'],
  devops_engineer: ['kubernetes', 'docker', 'terraform', 'aws', 'linux', 'cicd', 'go'],
  security_engineer: ['python', 'linux', 'aws', 'kubernetes', 'security'],
  product_manager: ['product-management', 'communication', 'leadership', 'sql'],
  product_designer: ['figma', 'design', 'communication'],
  engineering_manager: ['leadership', 'communication', 'project-management'],
  quantitative_researcher: ['python', 'sql', 'cpp', 'statistics'],
  hardware_engineer: ['cpp', 'python', 'linux'],
  account_executive: ['communication', 'sales'],
  marketing: ['communication', 'marketing'],
  financial_analyst: ['sql', 'excel', 'finance'],
  recruiter: ['communication', 'hr'],
};

/** Map legacy job_family → career area facet values */
export const FAMILY_TO_CAREER_AREAS = {
  software_engineer: ['backend', 'full_stack'],
  ai_engineer: ['ai', 'machine_learning'],
  machine_learning_engineer: ['machine_learning', 'ai'],
  data_engineer: ['data'],
  devops_engineer: ['devops', 'cloud'],
  security_engineer: ['security'],
  product_manager: ['product'],
  product_designer: ['design'],
  engineering_manager: ['management'],
  quantitative_researcher: ['quantitative'],
  hardware_engineer: ['hardware'],
  account_executive: ['sales'],
  marketing: ['marketing'],
  financial_analyst: ['finance'],
  recruiter: ['hr'],
};

export const LEVEL_TO_EXPERIENCE = {
  L1: 'intern',
  L2: 'entry',
  L3: 'entry',
  L4: 'mid',
  L5: 'senior',
  L6: 'staff',
  L7: 'principal',
  L8: 'director',
  L9: 'director',
};

export const EXPERIENCE_RANK = {
  intern: 1,
  new_grad: 2,
  entry: 3,
  mid: 4,
  senior: 5,
  staff: 6,
  principal: 7,
  director: 8,
};

/** Conservative minimum YOE per experience band — used when years_required is unknown. */
export const JOB_BAND_MIN_YEARS = {
  intern: 0,
  new_grad: 0,
  entry: 1,
  mid: 3,
  senior: 5,
  staff: 8,
  principal: 12,
  director: 15,
};

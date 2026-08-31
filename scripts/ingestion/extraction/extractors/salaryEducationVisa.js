import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';

const SAL = 'SalaryExtractor';
const EDU = 'EducationExtractor';
const VISA = 'VisaExtractor';

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractSalary(ctx) {
  const ats = ctx.ats || {};
  if (ats.salary || ats.compensation) {
    const s = normalizeAtsSalary(ats.salary || ats.compensation);
    if (s) {
      return {
        salary: extractionResult({
          value: s,
          confidence: computeConfidence('structured', 0.95),
          source: 'structured',
          status: 'trusted',
          evidence: 'ATS compensation',
          extractor: SAL,
        }),
      };
    }
  }

  const text = `${ctx.title || ''}\n${ctx.description || ''}`;
  const m = text.match(
    /(?:USD|INR|EUR|GBP|\$|₹|€|£)\s?([\d,]+(?:\.\d+)?)\s*(?:k|K)?\s*(?:-|–|to)\s*(?:USD|INR|EUR|GBP|\$|₹|€|£)?\s?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i,
  );
  if (m) {
    const min = parseMoney(m[1]);
    const max = parseMoney(m[2]);
    if (min > 0 && max > 0) {
      return {
        salary: extractionResult({
          value: { min, max, currency: guessCurrency(m[0]) },
          confidence: computeConfidence('regex', 0.75, { hasEvidence: true }),
          source: 'regex',
          status: 'ambiguous',
          evidence: m[0],
          extractor: SAL,
        }),
      };
    }
  }

  return { salary: missingResult(SAL) };
}

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractEducation(ctx) {
  const text = `${ctx.title || ''}\n${ctx.description || ''}`;
  const patterns = [
    { re: /\bph\.?d\b/i, label: 'PhD' },
    { re: /\bmaster'?s\b|\bm\.?s\.?\b|\bmba\b/i, label: "Master's" },
    { re: /\bbachelor'?s\b|\bb\.?s\.?\b|\bb\.?tech\b/i, label: "Bachelor's" },
  ];
  for (const p of patterns) {
    if (p.re.test(text) && /\b(degree|education|qualification|require)\b/i.test(text)) {
      return {
        education: extractionResult({
          value: p.label,
          confidence: computeConfidence('regex', 0.7, { hasEvidence: true }),
          source: 'regex',
          status: 'ambiguous',
          evidence: null,
          extractor: EDU,
        }),
      };
    }
  }
  return { education: missingResult(EDU) };
}

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractVisa(ctx) {
  const text = `${ctx.description || ''}`;
  if (/\b(visa sponsorship|sponsor(?:s|ship)? (?:a |an )?visa|h-?1b)\b/i.test(text)) {
    const neg = /\b(no visa sponsorship|cannot sponsor|unable to sponsor)\b/i.test(text);
    return {
      visaSponsorship: extractionResult({
        value: !neg,
        confidence: computeConfidence('regex', 0.8, { hasEvidence: true }),
        source: 'regex',
        status: 'ambiguous',
        evidence: null,
        extractor: VISA,
      }),
    };
  }
  return { visaSponsorship: missingResult(VISA) };
}

function parseMoney(s) {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function guessCurrency(s) {
  if (/₹|INR/i.test(s)) return 'INR';
  if (/€|EUR/i.test(s)) return 'EUR';
  if (/£|GBP/i.test(s)) return 'GBP';
  return 'USD';
}

function normalizeAtsSalary(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && (raw.min != null || raw.max != null)) return raw;
  return null;
}

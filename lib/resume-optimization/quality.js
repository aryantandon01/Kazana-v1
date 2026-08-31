/**
 * Resume Quality Engine — deterministic, cheap-first analysis.
 *
 * Runs BEFORE any LLM call. Evaluates the structured resume representation
 * against recruiter/ATS best practices. Returns dimension scores, strengths,
 * weaknesses, and suggested priorities for the coaching conversation.
 *
 * The quality engine NEVER invokes an LLM — it is pure data analysis.
 */

const WEAK_VERBS = new Set([
  'worked', 'helped', 'assisted', 'made', 'did', 'got', 'handled',
  'used', 'utilized', 'participated', 'involved', 'contributed',
  'responsible for', 'tasked with', 'completed', 'performed',
]);

const DIMENSIONS = [
  { key: 'summary', label: 'Summary', weight: 0.15 },
  { key: 'quantification', label: 'Quantified Impact', weight: 0.25 },
  { key: 'action_verbs', label: 'Action Verbs', weight: 0.15 },
  { key: 'ats_compatibility', label: 'ATS Compatibility', weight: 0.2 },
  { key: 'bullet_quality', label: 'Bullet Quality', weight: 0.15 },
  { key: 'section_completeness', label: 'Section Completeness', weight: 0.1 },
];

const CONTACT_PATTERNS = {
  email: /[\w.+-]+@[\w-]+\.[\w.]+/,
  phone: /(\+?\d[\d\s().-]{7,}\d)/,
  linkedin: /linkedin\.com/i,
};

/**
 * Deterministically analyze a parsed resume.
 * @param {object} parsed - canonical resume JSON
 * @returns {{ overallScore: number, dimensionScores: object, strengths: string[], weaknesses: string[], priorities: string[], checks: object[] }}
 */
export function analyzeResumeQuality(parsed = {}) {
  const checks = runChecks(parsed);
  const dimensionScores = computeDimensionScores(checks);
  const overallScore = weightedOverall(dimensionScores);

  const strengths = checks.filter((c) => c.pass).map((c) => c.strengthText).filter(Boolean);
  const weaknesses = checks.filter((c) => !c.pass).map((c) => c.weaknessText).filter(Boolean);
  const priorities = buildPriorities(checks);

  return {
    overallScore: round2(overallScore),
    dimensionScores: Object.fromEntries(
      Object.entries(dimensionScores).map(([k, v]) => [k, round2(v)]),
    ),
    strengths,
    weaknesses,
    priorities,
    checks,
  };
}

function runChecks(parsed = {}) {
  const summary = String(parsed.summary || '').trim();
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
  const education = Array.isArray(parsed.education) ? parsed.education : [];
  const certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];
  const links = Array.isArray(parsed.links) ? parsed.links : [];

  const allBullets = experience.flatMap((e) => e.bullets || []).map((b) => String(b).trim()).filter(Boolean);
  const contactText = [parsed.email, parsed.phone, ...links.map((l) => String(l))].join(' ');

  const checks = [];

  // Summary
  checks.push({
    id: 'summary',
    pass: summary.length >= 20,
    score: summary.length >= 60 ? 1 : summary.length >= 20 ? 0.6 : 0.2,
    strengthText: summary.length >= 20 ? 'Summary section present with substance' : null,
    weaknessText: summary.length < 20 ? 'No meaningful summary - recruiters scan this first' : null,
  });

  // Contact details
  const hasEmail = CONTACT_PATTERNS.email.test(contactText);
  const hasPhone = CONTACT_PATTERNS.phone.test(contactText);
  const hasLinkedIn = CONTACT_PATTERNS.linkedin.test(contactText);
  const contactCount = [hasEmail, hasPhone, hasLinkedIn].filter(Boolean).length;
  checks.push({
    id: 'contact',
    pass: contactCount >= 2,
    score: contactCount / 3,
    strengthText: contactCount >= 2 ? 'Contact details present' : null,
    weaknessText: contactCount < 2 ? 'Missing key contact details (email/phone/LinkedIn)' : null,
  });

  // Quantified impact
  const quantifiedBullets = allBullets.filter((b) => /\d+%|\$\d|\d+ (users|requests|rows|ms|seconds|hours|days|people|revenue|customers)|[0-9],?[0-9]{2,}/.test(b));
  const quantScore = allBullets.length ? quantifiedBullets.length / allBullets.length : 0.3;
  checks.push({
    id: 'quantification',
    pass: quantScore >= 0.3,
    score: quantScore,
    strengthText: quantScore >= 0.5 ? 'Strong quantified impact across bullets' : null,
    weaknessText: quantScore < 0.3 ? 'Most bullets lack quantified impact (numbers, %, scale)' : null,
  });

  // Weak verbs
  const weakCount = allBullets.filter((b) => {
    const first = b.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    return [...WEAK_VERBS].some((w) => first.includes(w));
  }).length;
  const weakScore = allBullets.length ? 1 - weakCount / allBullets.length : 0.5;
  checks.push({
    id: 'action_verbs',
    pass: weakScore >= 0.7,
    score: weakScore,
    strengthText: weakScore >= 0.7 ? 'Action verbs used effectively' : null,
    weaknessText: weakScore < 0.7 ? weakCount + ' bullet(s) start with weak verbs (worked, helped, made...)' : null,
  });

  // Bullet length
  const tooShort = allBullets.filter((b) => b.split(/\s+/).length < 4).length;
  const tooLong = allBullets.filter((b) => b.split(/\s+/).length > 30).length;
  const bulletScore = allBullets.length
    ? 1 - (tooShort + tooLong) / Math.max(1, allBullets.length) * 0.5
    : 0.4;
  checks.push({
    id: 'bullet_quality',
    pass: bulletScore >= 0.6,
    score: bulletScore,
    strengthText: allBullets.length > 0 && bulletScore >= 0.7 ? 'Bullets are well-sized' : null,
    weaknessText: allBullets.length === 0 ? 'No experience bullets found' : tooShort > 0 ? tooShort + ' bullet(s) are too short' : tooLong > 0 ? tooLong + ' bullet(s) are overly long' : null,
  });

  // Skills
  const skillsScore = skills.length >= 3 ? 1 : skills.length >= 1 ? 0.5 : 0.1;
  checks.push({
    id: 'skills',
    pass: skills.length >= 3,
    score: skillsScore,
    strengthText: skills.length >= 5 ? 'Skills section well populated' : null,
    weaknessText: skills.length < 3 ? 'Skills section too thin' : null,
  });

  // Section completeness
  const sections = [experience.length > 0, education.length > 0, skills.length > 0, Boolean(summary)];
  const sectionScore = sections.filter(Boolean).length / sections.length;
  checks.push({
    id: 'section_completeness',
    pass: sectionScore >= 0.75,
    score: sectionScore,
    strengthText: sectionScore >= 0.75 ? 'Core sections complete' : null,
    weaknessText: sectionScore < 0.75 ? 'Missing core sections (experience/education/skills/summary)' : null,
  });

  // Certifications
  checks.push({
    id: 'certifications',
    pass: certifications.length > 0,
    score: certifications.length > 0 ? 1 : 0.5,
    strengthText: certifications.length > 0 ? 'Certifications listed' : null,
    weaknessText: null,
  });

  // ATS formatting risk
  const atsRiskScore = parsed.formatting_risk ? 1 - parsed.formatting_risk : 0.85;
  checks.push({
    id: 'ats_formatting',
    pass: atsRiskScore >= 0.6,
    score: atsRiskScore,
    strengthText: atsRiskScore >= 0.8 ? 'Formatting looks ATS-safe' : null,
    weaknessText: atsRiskScore < 0.6 ? 'Possible ATS issues detected (tables/columns/embedded graphics)' : null,
  });

  return checks;
}

function computeDimensionScores(checks) {
  const out = {};
  for (const dim of DIMENSIONS) {
    const matching = checks.filter((c) => c.id === dim.key);
    out[dim.key] = matching.length ? matching.reduce((s, m) => s + m.score, 0) / matching.length : 0.5;
  }
  return out;
}

function weightedOverall(dimensionScores) {
  const totalWeight = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  const weighted = DIMENSIONS.reduce((s, d) => s + (dimensionScores[d.key] ?? 0.5) * d.weight, 0);
  return totalWeight > 0 ? weighted / totalWeight : 0.5;
}

function buildPriorities(checks) {
  const low = checks.filter((c) => !c.pass).sort((a, b) => a.score - b.score);
  return low.slice(0, 3).map((c) => c.weaknessText).filter(Boolean);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
/**
 * Resume Copilot prompts — versioned and model-agnostic.
 *
 * The structured resume representation is the source of truth.
 * The parser converts raw PDF text → canonical JSON.
 * The optimizer produces diff-based suggestions, never fabricating content.
 *
 * Versions enable measuring prompt quality over time (calibration).
 */

export const RESUME_PARSE_PROMPT_VERSION = 'resume-parse-v1';
export const RESUME_OPTIMIZE_PROMPT_VERSION = 'resume-optimize-v1';

/**
 * Extract canonical resume JSON from raw PDF text.
 * @param {string} pdfText
 */
export function buildParseResumePrompt(pdfText) {
  return `You are an information extraction engine for resumes. Convert the raw resume text below into a canonical structured resume JSON representation.

Rules:
- Extract only what is explicitly present in the text. Do NOT invent facts, dates, companies, skills, or metrics.
- If a section is absent, use an empty array or empty string — do not fabricate it.
- Preserve the original wording of bullet points verbatim (do not rewrite).
- Return valid JSON only. No markdown, no prose.

Schema:
{
  "name": string,
  "headline": string or null,
  "email": string or null,
  "phone": string or null,
  "summary": string or "",
  "experience": [
    {
      "company": string,
      "title": string,
      "location": string or null,
      "date_range": string or null,
      "bullets": ["verbatim original bullet text"],
      "technologies": ["mentioned technologies, deduplicated"]
    }
  ],
  "projects": [ { "name": string, "description": string, "technologies": [] } ],
  "education": [ { "school": string, "degree": string, "graduation_year": string or null } ],
  "skills": ["skills mentioned"],
  "certifications": ["certifications mentioned"],
  "publications": ["publications mentioned"],
  "links": ["URLs or handles mentioned"],
  "awards": ["awards mentioned"],
  "languages": ["languages mentioned"],
  "formatting_risk": number 0 to 1 (estimate of ATS-hostile formatting: tables, multi-column, embedded graphics)
}

Raw resume text:
---
${String(pdfText || '').slice(0, 20000)}
---`;
}

/**
 * Build prompt for general or job-specific resume optimization.
 * Produces diff-based, explainable suggestions.
 *
 * @param {{
 *   parsed: object,
 *   qualityReport: object,
 *   goal?: string|null,
 *   jobContext?: { title?: string, company?: string, skills?: string[], careerAreas?: string[] }|null,
 * }} ctx
 */
export function buildOptimizeResumePrompt({ parsed, qualityReport, goal = null, jobContext = null }) {
  const qualitySummary = qualityReport
    ? JSON.stringify(
        {
          overallScore: qualityReport.overallScore,
          dimensionScores: qualityReport.dimensionScores,
          weaknesses: qualityReport.weaknesses,
          priorities: qualityReport.priorities,
        },
        null,
        2,
      )
    : 'No quality report available.';

  const jobLines = jobContext
    ? [
        'Target job context:',
        `- Title: ${jobContext.title || ''}`,
        `- Company: ${jobContext.company || ''}`,
        jobContext.skills?.length ? `- Key skills: ${jobContext.skills.slice(0, 12).join(', ')}` : '',
        jobContext.careerAreas?.length ? `- Career areas: ${jobContext.careerAreas.slice(0, 8).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return `You are a meticulous resume coach working with a candidate. You review structured resume data and produce concrete, diff-based improvements. You NEVER fabricate experience, achievements, skills, or metrics.

${jobLines ? `\n${jobLines}\n` : ''}
${goal ? `\nUser goal: ${goal}\n` : ''}

Resume (structured):
${JSON.stringify(parsed, null, 2).slice(0, 18000)}

Quality analysis:
${qualitySummary}

Rules:
- Only suggest edits grounded in the resume. Do NOT invent employers, projects, or quantified results.
- If stronger metrics would help but are not present, add a follow-up QUESTION in the "questions" array instead of inventing a number.
- Keep suggestions concise, high-signal, and explainable.
- Prefer high-impact changes first: quantification, keyword alignment with the target role, summary rewrite, weak-verb replacements.
- For each suggestion provide a fieldPath (dot notation into the structured JSON, e.g. "experience[0].bullets[2]" or "summary"), currentText (exact current value), suggestedText, and a short rationale.

Return valid JSON only with this schema:
{
  "analysis": "1-2 sentences on the biggest levers for this resume",
  "suggestions": [
    {
      "fieldPath": "experience[0].bullets[2]",
      "currentText": "exact existing text",
      "suggestedText": "proposed replacement text",
      "rationale": "why this improves the resume",
      "estimatedImpact": { "ats_compatibility": 0-100, "match_relevance": 0-100 }
    }
  ],
  "questions": ["follow-up questions to gather missing detail, if any"]
}`;
}
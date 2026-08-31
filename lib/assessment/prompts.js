/**
 * Assessment prompts — versioned and isolated from business logic.
 *
 * Each prompt template is versioned (exported VERSION) so we can measure
 * whether a prompt change improves or degrades assessment quality over time.
 *
 * Three prompt families:
 *   1. generateSessionQuestions — produces the question set for a session
 *   2. evaluateResponse          — scores a single candidate answer against the rubric
 *   3. buildSessionAssessment    — rolls up all answers into a final confidence-scored report
 */

export const GENERATE_QUESTIONS_PROMPT_VERSION = 'generate-questions-v1';
export const EVALUATE_RESPONSE_PROMPT_VERSION = 'evaluate-response-v2';
export const BUILD_ASSESSMENT_PROMPT_VERSION = 'build-assessment-v1';

/**
 * Build prompt that asks the model to create a question set for an interview.
 */
export function buildGenerateQuestionsPrompt({
  company,
  roleLabel,
  level,
  rubric,
  questionCount = 8,
  jobContext = null,
}) {
  const dimensionLines = (rubric?.dimensions || [])
    .map((d) => '- ' + d.label + ' (weight ' + d.weight + '): ' + (d.focus || ''))
    .join('\n');

  return `You are an AI interview coach and assessment engine.

Plan one practice interview for:
- Company: ${company}
- Role: ${roleLabel}
- Level: ${level}${jobContext ? '\n- Job context: ' + jobContext : ''}

Evaluation rubric dimensions:
${dimensionLines}

Generate ${questionCount} interview questions that would actually be asked at this company for this role and level. Mix question types: several behavioral/situational, some technical (if the role is technical), and one system design or deep-dive question where appropriate. Questions should be specific to the company's business and the role's responsibilities — not generic.

Return valid JSON only with this exact schema:
{
  "introduction": "A one sentence greeting to the candidate about this mock interview.",
  "questions": [
    {
      "type": "behavioral" | "technical" | "system_design" | "situational" | "coding",
      "question": "The full question text",
      "contextNote": "Optional hint about what the interviewer is probing"
    }
  ]
}
No markdown. No prose outside the JSON.`;
}

/**
 * Build prompt that evaluates a single candidate answer.
 * v2: consumes rubric_dimensions (positive/negative indicators, guidance) when available.
 */
export function buildEvaluateResponsePrompt({
  company,
  roleLabel,
  level,
  question,
  contextNote = null,
  userResponse,
  rubric,
  rubricDimensions = [],
}) {
  const dimensionLines = (rubric?.dimensions || [])
    .map((d) => '- ' + d.label + ' (weight ' + d.weight + '): ' + (d.focus || ''))
    .join('\n');

  // v2: enrich dimension lines with positive/negative indicators + guidance
  const enrichedLines = (rubricDimensions || []).map((rd) => {
    let line = '- ' + (rd.dimension_label || rd.dimension_slug) + ' (weight ' + rd.weight + '): ' + (rd.focus || 'General evaluation focus');
    if (rd.positive_indicators?.length) {
      line += '\n  Positive signals: ' + rd.positive_indicators.join('; ');
    }
    if (rd.negative_indicators?.length) {
      line += '\n  Negative signals: ' + rd.negative_indicators.join('; ');
    }
    return line;
  });
  const displayDimensionLines = enrichedLines.length ? enrichedLines.join('\n') : dimensionLines;
  const schemaNote = enrichedLines.length ? '\nScore every dimension listed above. Do not omit dimension keys.' : '';

  return `You are a calibrated interview assessor. Score the candidate's answer to ONE interview question using the rubric below.

Context:
- Company: ${company}
- Role: ${roleLabel}
- Level: ${level}
- Evaluation rubric dimensions:
${displayDimensionLines}

Question:
${question}${contextNote ? '\n\nProbing note: ' + contextNote : ''}

Candidate's answer:
${userResponse || '(no answer provided)'}

Return valid JSON only with this exact schema:
{
  "dimensions": {
    "<dimensionKey>": {
      "score": 0.0-1.0,
      "rationale": "One sentence explaining the score"
    }
  },
  "overall": 0.0-1.0,
  "confidence": 0.0-1.0,
  "strengths": ["2-3 specific things the candidate did well"],
  "weaknesses": ["1-2 specific things to improve"],
  "suggestedAnswer": "A concise reference answer or key points they missed"
}${schemaNote}
Score objectively. Do not inflate. A weak answer should score low. No markdown. JSON only.`;
}

/**
 * Build prompt that rolls up all answered questions into a final assessment.
 * The overall/dimension numeric scores are computed deterministically by the
 * engine — this prompt only generates the text (summary, strengths, gaps, recommendations).
 */
export function buildAssessmentPrompt({ company, roleLabel, level, rubric, evaluations }) {
  const dimensionLines = (rubric?.dimensions || [])
    .map((d) => '- ' + d.label + ' (weight ' + d.weight + '): ' + (d.focus || ''))
    .join('\n');

  const answeredCount = evaluations.filter((e) => e.userResponse).length;

  return `You are a calm, calibrated AI career advisor. Produce the narrative text for a recently completed mock interview assessment.

Context:
- Company: ${company}
- Role: ${roleLabel}
- Level: ${level}
- Rubric: ${rubric?.name || 'General'}
- Rubric dimensions:
${dimensionLines}

Question-by-question evaluations (${answeredCount} answered out of ${evaluations.length}):
${evaluations
  .map((e, i) => {
    const ev = e.evaluation ? JSON.stringify(e.evaluation) : 'null';
    return (i + 1) + '. [' + e.type + '] ' + e.question + '\n   Candidate: ' + (e.userResponse ? '(answered)' : '(skipped)') + '\n   Evaluation: ' + ev;
  })
  .join('\n')}

Return valid JSON only with this exact schema:
{
  "confidence": 0.0-1.0,
  "summary": "2-3 sentences summarizing overall performance",
  "strengths": ["3-5 specific strengths observed"],
  "gaps": ["2-4 improvement areas tied to rubric dimensions"],
  "recommendations": [
    {
      "title": "Action title",
      "detail": "What to do and why it matters for this company's interviews"
    }
  ]
}
Be honest and calibrated — not generous. JSON only.`;
}
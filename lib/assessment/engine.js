/**
 * Assessment engine — orchestrates AI interview practice sessions.
 *
 * Lifecycle:
 *   createSession()      → resolve rubric, generate questions, persist session + questions
 *   evaluateResponse()   → score one answer against the rubric (confidence-scored)
 *   completeSession()    → aggregate normalized dimension scores; LLM only for text
 *
 * v2: Per-question evaluations and per-dimension scores are written to
 * normalized relational tables (practice_question_evaluations,
 * practice_dimension_scores). The legacy JSONB columns on practice_questions
 * and practice_sessions are still populated for backward compatibility
 * (removed in a future cleanup migration).
 *
 * All LLM I/O goes through lib/assessment/provider.js (model-agnostic).
 * All prompt text lives in lib/assessment/prompts.js (versioned).
 */

import { completeJson } from './provider.js';
import {
  buildGenerateQuestionsPrompt,
  buildEvaluateResponsePrompt,
  buildAssessmentPrompt,
  GENERATE_QUESTIONS_PROMPT_VERSION,
  EVALUATE_RESPONSE_PROMPT_VERSION,
  BUILD_ASSESSMENT_PROMPT_VERSION,
} from './prompts.js';

const DEFAULT_QUESTION_COUNT = 8;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_PROVIDER = 'deepseek';

/** Rubric selection: dedicated rubric by role key, else generic. */
export const ROLE_TO_RUBRIC_SLUG = {
  software_engineer: 'rubric-software-engineer',
  machine_learning_engineer: 'rubric-machine-learning-engineer',
  ai_engineer: 'rubric-machine-learning-engineer',
  ai_ml_researcher: 'rubric-machine-learning-engineer',
  data_scientist: 'rubric-data-scientist',
  product_manager: 'rubric-product-manager',
  engineering_manager: 'rubric-software-engineer',
  software_engineering_manager: 'rubric-software-engineer',
  data_engineer: 'rubric-software-engineer',
  devops_engineer: 'rubric-software-engineer',
  site_reliability_engineer: 'rubric-software-engineer',
  security_engineer: 'rubric-software-engineer',
  full_stack: 'rubric-software-engineer',
};

const GENERIC_RUBRIC_SLUG = 'rubric-generic';

export function resolveRubricSlug(roleKey) {
  return ROLE_TO_RUBRIC_SLUG[roleKey] || GENERIC_RUBRIC_SLUG;
}

/**
 * Create a practice session with generated questions.
 * Records provider/model/temperature/prompt_version/rubric_version for reproducibility.
 */
export async function createSession({ supabase, userId, company, roleKey, roleLabel, level, jobId = null }) {
  const rubricSlug = resolveRubricSlug(roleKey);

  const { data: rubric } = await supabase.from('practice_rubrics').select('*').eq('slug', rubricSlug).maybeSingle();

  // Job context: pull title + location from the joined job for a more tailored session
  let jobContext = null;
  if (jobId) {
    const { data: job } = await supabase.from('jobs').select('title, location').eq('id', jobId).maybeSingle();
    if (job) jobContext = `${job.title}${job.location ? ` — ${job.location}` : ''}`;
  }

  // 1. Generate questions via LLM
  const prompt = buildGenerateQuestionsPrompt({
    company,
    roleLabel,
    level,
    rubric: rubric || { name: 'General Interview Rubric', dimensions: [{ key: 'general', label: 'General', weight: 1, focus: 'Overall performance' }] },
    questionCount: DEFAULT_QUESTION_COUNT,
    jobContext,
  });

  let generated = null;
  let llmModel = null;
  let promptVersion = GENERATE_QUESTIONS_PROMPT_VERSION;

  try {
    const result = await completeJson(prompt);
    if (result.data) {
      generated = result.data;
      llmModel = result.model;
      if (result.version === 'none') promptVersion = 'fallback';
    }
  } catch (err) {
    console.warn('Assessment: question generation failed', err.message);
  }

  // 2. Fallback question set if LLM unavailable/failed — deterministic backlog
  const questions = buildQuestionsList(generated?.questions, company, roleLabel, level);

  // 3. Persist session (v2: record provider/model/temperature/prompt_version/rubric_version)
  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: userId,
      company,
      role_key: roleKey,
      role_label: roleLabel,
      level,
      job_id: jobId,
      rubric_id: rubric?.id || null,
      status: 'in_progress',
      question_count: questions.length,
      current_index: 0,
      provider: DEFAULT_PROVIDER,
      model: llmModel || null,
      prompt_version: promptVersion,
      rubric_version: rubric?.version || 1,
      temperature: DEFAULT_TEMPERATURE,
    })
    .select()
    .single();

  if (sessionError) throw new Error(sessionError.message);

  // 4. Persist questions (v2: generated_vs_curated, difficulty defaults)
  const { error: questionsError } = await supabase.from('practice_questions').insert(
    questions.map((q, i) => ({
      session_id: session.id,
      order_index: i,
      type: q.type,
      question: q.question,
      context_note: q.contextNote || null,
      generated_vs_curated: generated ? 'generated' : 'curated',
      difficulty: q.difficulty || 3,
      estimated_duration: 180,
    })),
  );

  if (questionsError) throw new Error(questionsError.message);

  // 5. Event: session created
  await supabase.from('assessment_events').insert({
    user_id: userId,
    session_id: session.id,
    event_type: 'session_created',
    payload: { company, role_key: roleKey, role_label: roleLabel, level, generated: Boolean(generated) },
  }).catch(() => {});

  return {
    session: { ...session, provider: DEFAULT_PROVIDER, model: llmModel, prompt_version: promptVersion, rubric_version: rubric?.version || 1 },
    session_meta: {
      promptVersion,
      llmModel,
      generated: Boolean(generated),
      intro: generated?.introduction || null,
    },
  };
}

/**
 * Evaluate a candidate's answer for one question.
 * v2: writes normalized practice_question_evaluations + practice_dimension_scores,
 * plus legacy JSONB on practice_questions for backward compatibility.
 */
export async function evaluateResponse({ supabase, session, question, userResponse }) {
  const rubric = await loadRubric(supabase, session.rubric_id);
  const rubricDimensions = await loadRubricDimensions(supabase, session.rubric_id);

  const prompt = buildEvaluateResponsePrompt({
    company: session.company,
    roleLabel: session.role_label,
    level: session.level,
    question: question.question,
    contextNote: question.context_note,
    userResponse,
    rubric: rubric || { dimensions: [{ key: 'general', label: 'General', weight: 1, focus: 'Overall performance' }] },
    rubricDimensions,
  });

  let evaluation = null;
  let llmModel = null;
  let promptVersion = EVALUATE_RESPONSE_PROMPT_VERSION;
  let llmFailed = false;

  try {
    const result = await completeJson(prompt);
    if (result.data) {
      evaluation = sanitizeEvaluation(result.data, rubric?.dimensions || []);
      llmModel = result.model;
      if (result.version === 'none') promptVersion = 'fallback';
    } else {
      llmFailed = true;
    }
  } catch (err) {
    console.warn('Assessment: response evaluation failed', err.message);
    llmFailed = true;
  }

  if (llmFailed || !evaluation) {
    evaluation = fallbackEvaluation(userResponse);
    promptVersion = 'fallback';
  }

  // ---- v2: write normalized evaluation -------------------------------------
  const { data: evalRow, error: evalError } = await supabase
    .from('practice_question_evaluations')
    .insert({
      question_id: question.id,
      provider: DEFAULT_PROVIDER,
      model: llmModel,
      prompt_version: promptVersion,
      temperature: DEFAULT_TEMPERATURE,
      overall_score: round2(evaluation.overall),
      overall_confidence: round2(evaluation.confidence),
      evaluation_summary: '',
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      suggested_answer: evaluation.suggestedAnswer,
    })
    .select()
    .single();

  if (evalError) throw new Error(evalError.message);

  // ---- v2: write per-dimension scores (the primary asset) -------------------
  if (Object.keys(evaluation.dimensions).length > 0 && rubricDimensions.length > 0) {
    const dimensionRows = [];
    for (const dim of rubricDimensions) {
      const dimScore = evaluation.dimensions[dim.dimension_slug];
      if (dimScore == null) continue;
      dimensionRows.push({
        evaluation_id: evalRow.id,
        dimension_id: dim.dimension_id,
        score: round2(dimScore.score),
        confidence: round2(evaluation.confidence),
        evidence: dimScore.rationale || null,
      });
    }
    if (dimensionRows.length) {
      const { error: dimError } = await supabase.from('practice_dimension_scores').insert(dimensionRows);
      if (dimError) throw new Error(dimError.message);
    }
  }

  // ---- legacy backward-compat JSONB write -----------------------------------
  await supabase
    .from('practice_questions')
    .update({
      user_response: userResponse,
      evaluation: {
        ...evaluation,
        meta: {
          promptVersion,
          llmModel,
          evaluated_at: new Date().toISOString(),
          evaluation_id: evalRow.id,
        },
      },
    })
    .eq('id', question.id);

  // ---- event: question answered ---------------------------------------------
  await supabase.from('assessment_events').insert({
    user_id: session.user_id,
    session_id: session.id,
    event_type: 'question_answered',
    payload: { question_id: question.id, evaluation_id: evalRow.id, overall_score: round2(evaluation.overall) },
  }).catch(() => {});

  return evaluation;
}

/**
 * Complete a session.
 * v2: aggregate normalized dimension scores into a competency vector;
 * LLM only generates the summary text (strengths/gaps/recommendations).
 */
export async function completeSession({ supabase, session }) {
  const { data: questions } = await supabase
    .from('practice_questions')
    .select('*')
    .eq('session_id', session.id)
    .order('order_index', { ascending: true });

  // Load evaluation IDs for each answered question
  const { data: evalRows } = await supabase
    .from('practice_question_evaluations')
    .select('*, practice_questions(session_id)')
    .in('question_id', (questions || []).map((q) => q.id))
    .catch(() => ({ data: [] }));

  // Aggregate dimension scores across all evaluations
  const { data: dimensionRows } = await supabase
    .from('practice_dimension_scores')
    .select('dimension_id, score, confidence, evidence, dimensions(slug, label)')
    .in('evaluation_id', (evalRows || []).map((e) => e.id))
    .catch(() => ({ data: [] }));

  const rubricDimensions = await loadRubricDimensions(supabase, session.rubric_id);
  const rubric = await loadRubric(supabase, session.rubric_id);

  // ---- competency vector: weighted aggregation ------------------------------
  const dimensionAgg = {};
  for (const row of dimensionRows || []) {
    const slug = row.dimensions?.slug || String(row.dimension_id);
    const weight = rubricDimensions.find((rd) => rd.dimension_id === row.dimension_id)?.weight || 0.1;
    if (!dimensionAgg[slug]) {
      dimensionAgg[slug] = { dimension_id: row.dimension_id, label: row.dimensions?.label || slug, score: 0, weightSum: 0, confSum: 0, evidenceCount: 0, totalWeight: 0 };
    }
    const agg = dimensionAgg[slug];
    agg.score += Number(row.score) * Number(weight);
    agg.weightSum += Number(weight);
    agg.confSum += Number(row.confidence);
    agg.evidenceCount += 1;
    agg.totalWeight += Number(weight);
    if (row.evidence && !agg.evidence) agg.evidence = String(row.evidence);
  }

  const competencyVector = Object.entries(dimensionAgg).map(([slug, agg]) => ({
    slug,
    label: agg.label,
    dimension_id: agg.dimension_id,
    score: round2(agg.weightSum > 0 ? agg.score / agg.weightSum : 0),
    confidence: round2(agg.evidenceCount > 0 ? agg.confSum / agg.evidenceCount : 0.5),
    evidence: agg.evidence || null,
  }));

  // ---- overall score: weighted from competency vector -----------------------
  const totalWeight = rubricDimensions.reduce((sum, rd) => sum + Number(rd.weight), 0);
  const overallScore = totalWeight > 0
    ? competencyVector.reduce((sum, v) => {
        const weight = rubricDimensions.find((rd) => rd.dimension_id === v.dimension_id)?.weight || (1 / (competencyVector.length || 1));
        return sum + v.score * Number(weight);
      }, 0) / totalWeight
    : competencyVector.length
      ? competencyVector.reduce((sum, v) => sum + v.score, 0) / competencyVector.length
      : 0;

  const mathConfidence = competencyVector.length
    ? Math.min(0.95, 0.4 + (competencyVector.length / (rubricDimensions.length || 1)) * 0.5)
    : 0.15;

  // ---- LLM only for text summary --------------------------------------------
  const evaluationsForPrompt = (questions || []).map((q) => ({
    type: q.type,
    question: q.question,
    userResponse: q.user_response,
    evaluation: q.evaluation?.dimensions && q.evaluation?.overall != null ? q.evaluation : null,
  }));

  const prompt = buildAssessmentPrompt({
    company: session.company,
    roleLabel: session.role_label,
    level: session.level,
    rubric: rubric || { name: 'General Interview Rubric', dimensions: [{ key: 'general', label: 'General', weight: 1, focus: 'Overall performance' }] },
    evaluations: evaluationsForPrompt,
  });

  let text = null;
  let llmModel = null;
  let promptVersion = BUILD_ASSESSMENT_PROMPT_VERSION;
  let usedFallback = false;

  try {
    const result = await completeJson(prompt);
    if (result.data) {
      text = sanitizeAssessmentText(result.data);
      llmModel = result.model;
      if (result.version === 'none') promptVersion = 'fallback';
    } else {
      usedFallback = true;
    }
  } catch (err) {
    console.warn('Assessment: final assessment text failed', err.message);
    usedFallback = true;
  }

  if (usedFallback || !text) {
    text = fallbackAssessmentText(evaluationsForPrompt);
    promptVersion = 'fallback';
  }

  // ---- persist final assessment ---------------------------------------------
  const { data: updated, error } = await supabase
    .from('practice_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      overall_score: round2(overallScore),
      dimension_scores: Object.fromEntries(competencyVector.map((v) => [v.slug, { score: v.score, confidence: v.confidence, rationale: v.evidence || '' }])),
      strengths: text.strengths,
      gaps: text.gaps,
      recommendations: text.recommendations,
      confidence: {
        score: round2(text.confidence ?? mathConfidence),
        summary: text.summary,
        model: llmModel,
        promptVersion,
        version: 'assessment-confidence-v2',
      },
    })
    .eq('id', session.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // ---- event: interview completed -------------------------------------------
  await supabase.from('assessment_events').insert({
    user_id: session.user_id,
    session_id: session.id,
    event_type: 'interview_completed',
    payload: { overall_score: round2(overallScore), competency_vector: competencyVector.map((v) => ({ slug: v.slug, score: v.score })) },
  }).catch(() => {});

  return {
    session: { ...updated, competency_vector: competencyVector },
    assessment: {
      overallScore: round2(overallScore),
      dimensionScores: Object.fromEntries(competencyVector.map((v) => [v.slug, { score: v.score, rationale: v.evidence || '' }])),
      competencyVector,
      confidence: round2(text.confidence ?? mathConfidence),
      summary: text.summary,
      strengths: text.strengths,
      gaps: text.gaps,
      recommendations: text.recommendations,
    },
    promptVersion: usedFallback ? 'fallback' : promptVersion,
  };
}

// ---------------------------------------------------------------------------
// Helpers — sanitization, fallbacks, question building, rubric loading
// ---------------------------------------------------------------------------

async function loadRubric(supabase, rubricId) {
  if (!rubricId) return null;
  const { data } = await supabase.from('practice_rubrics').select('*').eq('id', rubricId).maybeSingle();
  return data || null;
}

async function loadRubricDimensions(supabase, rubricId) {
  if (!rubricId) return [];
  const { data } = await supabase
    .from('rubric_dimensions')
    .select('*, dimensions(slug, label)')
    .eq('rubric_id', rubricId);
  return (data || []).map((rd) => ({
    dimension_id: rd.dimension_id,
    dimension_slug: rd.dimensions?.slug || null,
    dimension_label: rd.dimensions?.label || null,
    weight: Number(rd.weight) || 0,
    focus: rd.focus,
    positive_indicators: rd.positive_indicators || [],
    negative_indicators: rd.negative_indicators || [],
  }));
}

function buildQuestionsList(rawQuestions, company, roleLabel, level) {
  if (Array.isArray(rawQuestions) && rawQuestions.length >= 4) {
    return rawQuestions
      .slice(0, 12)
      .map((q) => ({
        type: normalizeQuestionType(q.type),
        question: String(q.question || '').trim(),
        contextNote: q.contextNote ? String(q.contextNote).trim() : null,
        difficulty: q.difficulty != null ? clampInt(q.difficulty, 1, 5) : 3,
      }))
      .filter((q) => q.question.length > 5);
  }

  // Deterministic fallback questions
  const base = [
    {
      type: 'behavioral',
      question: `Tell me about a time you worked on a challenging problem at ${company || 'work'}. What was your approach and what did you learn?`,
      difficulty: 3,
    },
    {
      type: 'behavioral',
      question: `Describe a situation where you had to collaborate across teams or departments. How did you handle disagreements or competing priorities?`,
      difficulty: 3,
    },
    {
      type: 'situational',
      question: `Imagine you're given a project at ${company || 'the company'} with an aggressive timeline. How do you prioritize and deliver?`,
      difficulty: 3,
    },
    {
      type: roleLooksTechnical(roleLabel)
        ? 'technical'
        : 'behavioral',
      question: roleLooksTechnical(roleLabel)
        ? `Walk through how you would design a scalable system for ${company || 'the company'}'s core product. What trade-offs would you consider?`
        : `Why do you want to work at ${company || 'the company'} as a ${roleLabel || 'professional'}? What do you hope to contribute in the first 90 days?`,
      difficulty: 4,
    },
  ];

  if (roleLooksTechnical(roleLabel)) {
    base.push(
      {
        type: 'coding',
        question: 'Given a list of integers, write a function that returns the longest increasing subsequence length. Discuss time and space complexity.',
        difficulty: 4,
      },
      {
        type: 'technical',
        question: 'Explain a recent technical challenge you solved in depth. What was the root cause, how did you debug it, and what would you do differently?',
        difficulty: 3,
      },
      {
        type: 'system_design',
        question: `Design an API endpoint that serves a high-traffic read-heavy feed for ${company || 'a tech company'}. Cover caching, load balancing, and failure modes.`,
        difficulty: 5,
      },
      {
        type: 'behavioral',
        question: 'Tell me about a time you received constructive criticism. How did you respond and what changed in your approach afterward?',
        difficulty: 2,
      },
    );
  } else {
    base.push(
      {
        type: 'situational',
        question: 'A stakeholder strongly disagrees with your recommended approach. How do you handle the disagreement and drive a decision?',
        difficulty: 4,
      },
      {
        type: 'behavioral',
        question: `Tell me about a time you took initiative beyond your job description at ${company || 'work'}. What motivated you and what was the outcome?`,
        difficulty: 3,
      },
      {
        type: 'situational',
        question: 'You have three competing priorities due this week. How do you decide which to complete first and how do you communicate the trade-off?',
        difficulty: 3,
      },
      {
        type: 'behavioral',
        question: 'Describe a time you adapted to a significant change at work — a reorg, new tooling, or a pivot. How did you stay effective?',
        difficulty: 2,
      },
    );
  }

  return base;
}

function normalizeQuestionType(type) {
  const allowed = new Set(['behavioral', 'technical', 'system_design', 'situational', 'coding']);
  return allowed.has(type) ? type : 'behavioral';
}

function roleLooksTechnical(label) {
  const t = String(label || '').toLowerCase();
  return /(engineer|developer|scientist|architect|devops|sre|full.?stack|backend|frontend|data|machine learning|ai|quant)/.test(t);
}

/** Clamp + whitelist dimension scores from the model. */
function sanitizeEvaluation(data, dimensions) {
  const dimKeys = new Set((dimensions || []).map((d) => d.key));
  const rawDims = data?.dimensions || {};
  const dimensionsOut = {};
  for (const [key, val] of Object.entries(rawDims)) {
    if (!dimKeys.has(key) && dimKeys.size > 0) continue;
    dimensionsOut[key] = {
      score: clamp01(Number(val?.score) || 0),
      rationale: String(val?.rationale || '').slice(0, 300),
    };
  }
  return {
    dimensions: dimensionsOut,
    overall: clamp01(Number(data?.overall) || 0),
    confidence: clamp01(Number(data?.confidence) || 0.5),
    strengths: Array.isArray(data?.strengths) ? data.strengths.map(String).slice(0, 4) : [],
    weaknesses: Array.isArray(data?.weaknesses) ? data.weaknesses.map(String).slice(0, 3) : [],
    suggestedAnswer: String(data?.suggestedAnswer || '').slice(0, 1000),
  };
}

/** Only the text fields from the LLM rollup; numeric scores are computed deterministically. */
function sanitizeAssessmentText(data) {
  return {
    confidence: clamp01(Number(data?.confidence) || 0.5),
    summary: String(data?.summary || '').slice(0, 800),
    strengths: Array.isArray(data?.strengths) ? data.strengths.map(String).slice(0, 6) : [],
    gaps: Array.isArray(data?.gaps) ? data.gaps.map(String).slice(0, 6) : [],
    recommendations: Array.isArray(data?.recommendations)
      ? data.recommendations
          .map((r) => ({
            title: String(r?.title || ''),
            detail: String(r?.detail || ''),
          }))
          .filter((r) => r.title || r.detail)
          .slice(0, 6)
      : [],
  };
}

function fallbackEvaluation(userResponse) {
  const answered = Boolean(userResponse && userResponse.trim().length > 10);
  return {
    dimensions: {},
    overall: answered ? 0.5 : 0,
    confidence: 0.3,
    strengths: answered ? ['Provided a response'] : [],
    weaknesses: answered ? [] : ['No answer provided'],
    suggestedAnswer: '',
  };
}

function fallbackAssessmentText(evaluations) {
  const answered = evaluations.filter((e) => e.userResponse);
  return {
    confidence: 0.25,
    summary: 'Assessment generated from fallback scoring. Add an LLM provider for richer feedback.',
    strengths: [],
    gaps: ['Enable DEEPSEEK_API_KEY for detailed dimension-level feedback.'],
    recommendations: [
      {
        title: 'Add an LLM provider',
        detail: 'Set DEEPSEEK_API_KEY in your environment for calibrated, explainable assessments.',
      },
    ],
  };
}

function computeEngineConfidence(evaluations) {
  const answered = evaluations.filter((e) => e.userResponse && e.evaluation?.overall != null).length;
  if (!answered) return 0.15;
  return clamp01(0.4 + (answered / evaluations.length) * 0.5);
}

function clamp01(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return Math.min(1, Math.max(0, v));
}

function clampInt(n, min, max) {
  const v = Number.isFinite(Number(n)) ? Math.round(Number(n)) : min;
  return Math.min(max, Math.max(min, v));
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
/**
 * Resume Copilot engine — orchestrates the optimization lifecycle.
 *
 * Uploaded PDF → parsed structured JSON → quality analysis → optimization
 * suggestions → user accept/reject/edit → new version snapshot → PDF export.
 *
 * The structured resume representation is the source of truth.
 * The original uploaded PDF is NEVER modified.
 */

import { completeJson } from '@/lib/assessment/provider';
import { buildParseResumePrompt, buildOptimizeResumePrompt } from './prompts';
import { analyzeResumeQuality } from './quality';
import { getAdminClient } from '@/lib/supabase/admin';

const PARSE_PROMPT_FALLBACK = 'resume-parse-v1';

/**
 * Ensure a resume has parsed structured data.
 * Fetches the original PDF bytes, extracts text, and runs the LLM parser if needed.
 *
 * @param {object} supabase - SSR client (user-scoped)
 * @param {string} resumeId
 * @returns {Promise<{ parsed: object, isNew: boolean, quality: object }>}
 */
export async function ensureResumeParsed(supabase, resumeId) {
  const { data: parsedData, error: parsedError } = await supabase
    .from('resume_parsed_data')
    .select('*')
    .eq('resume_id', resumeId)
    .maybeSingle();

  if (!parsedError && parsedData) {
    const parsed = parsedData.parsed_json || {};
    return { parsed, isNew: false, quality: analyzeResumeQuality(parsed) };
  }

  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('id, user_id, file_url, name')
    .eq('id', resumeId)
    .single();

  if (resumeError || !resume) throw new Error('Resume not found');

  // Mark as parsing so concurrent requests don't double-parse
  await supabase
    .from('resumes')
    .update({ parsed_status: 'parsing' })
    .eq('id', resumeId)
    .catch(() => {});

  try {
    const pdfText = await extractPdfText(resume.file_url);
    const parsed = await parseResumeWithLlm(pdfText);

    // Store the first version (original structured parse)
    const { data: version, error: versionError } = await supabase
      .from('resume_versions')
      .insert({
        resume_id: resumeId,
        user_id: resume.user_id,
        version_number: 1,
        parsed_data: parsed,
        change_summary: 'Initial structured parse of uploaded PDF',
      })
      .select()
      .single();

    if (versionError) throw versionError;

    const { error: insertError } = await supabase
      .from('resume_parsed_data')
      .upsert({
        resume_id: resumeId,
        user_id: resume.user_id,
        version_id: version.id,
        parsed_json: parsed,
        parser_version: RESUME_PARSE_VERSION,
        parser_confidence: estimateParseConfidence(parsed),
        parsed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await supabase
      .from('resumes')
      .update({ parsed_status: 'ready', current_version_number: 1 })
      .eq('id', resumeId)
      .catch(() => {});

    return { parsed, isNew: true, quality: analyzeResumeQuality(parsed) };
  } catch (err) {
    await supabase
      .from('resumes')
      .update({ parsed_status: 'error' })
      .eq('id', resumeId)
      .catch(() => {});
    throw err;
  }
}

/**
 * Generate optimization suggestions for a resume, optionally job-targeted.
 *
 * @param {{
 *   supabase: object,
 *   sessionId: string,
 *   userId: string,
 *   parsed: object,
 *   goal?: string|null,
 *   jobContext?: object|null,
 * }} ctx
 * @returns {Promise<{ analysis: string, suggestions: object[], questions: string[] }>}
 */
export async function generateSuggestions({ supabase, sessionId, userId, parsed, goal = null, jobContext = null }) {
  const quality = analyzeResumeQuality(parsed);

  const prompt = buildOptimizeResumePrompt({
    parsed,
    qualityReport: quality,
    goal,
    jobContext,
  });

  const result = await completeJson(prompt);

  if (!result.data) {
    return { analysis: 'Could not generate suggestions right now.', suggestions: [], questions: [] };
  }

  const raw = result.data;
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions
        .filter((s) => s.fieldPath && (s.suggestedText || s.currentText))
        .map((s) => ({
          session_id: sessionId,
          user_id: userId,
          field_path: String(s.fieldPath),
          current_text: s.currentText ? String(s.currentText) : null,
          suggested_text: s.suggestedText ? String(s.suggestedText) : null,
          rationale: s.rationale ? String(s.rationale) : null,
          estimated_impact: s.estimatedImpact && typeof s.estimatedImpact === 'object' ? s.estimatedImpact : null,
          status: 'pending',
        }))
        .slice(0, 10)
    : [];

  // Persist suggestions
  const inserted = [];
  if (suggestions.length) {
    const { data, error } = await supabase.from('resume_suggestions').insert(suggestions).select();
    if (error) throw new Error(error.message);
    inserted.push(...(data || []));
  }

  return {
    analysis: raw.analysis ? String(raw.analysis) : '',
    suggestions: inserted,
    questions: Array.isArray(raw.questions) ? raw.questions.map(String).slice(0, 5) : [],
  };
}

/**
 * Apply an accepted or edited suggestion to the structured data,
 * create a new version snapshot, and update the current parsed data.
 *
 * @param {{
 *   supabase: object,
 *   resumeId: string,
 *   userId: string,
 *   suggestion: object,
 *   appliedText?: string|null,    // for 'edited' status
 * }} ctx
 * @returns {Promise<{ parsed: object, version: object, newVersionNumber: number }>}
 */
export async function applySuggestion({ supabase, resumeId, userId, suggestion, appliedText = null }) {
  const { data: parsedData, error: parsedError } = await supabase
    .from('resume_parsed_data')
    .select('*')
    .eq('resume_id', resumeId)
    .single();

  if (parsedError) throw parsedError;

  const parsed = JSON.parse(JSON.stringify(parsedData.parsed_json || {}));
  const newText = appliedText != null ? appliedText : suggestion.suggested_text;

  if (newText == null) {
    throw new Error('No text to apply for this suggestion');
  }

  // Apply to the structured data using field path (e.g. experience[0].bullets[2])
  const applied = applyFieldPath(parsed, suggestion.field_path, newText);

  // Create the new version snapshot
  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('current_version_number')
    .eq('id', resumeId)
    .single();
  if (resumeError) throw resumeError;

  const nextVersion = (resume.current_version_number || 1) + 1;

  const { data: version, error: versionError } = await supabase
    .from('resume_versions')
    .insert({
      resume_id: resumeId,
      user_id: userId,
      version_number: nextVersion,
      parsed_data: applied,
      change_summary: `Applied suggestion: ${suggestion.field_path}`,
    })
    .select()
    .single();

  if (versionError) throw versionError;

  // Update canonical parsed data + current version pointer
  await supabase
    .from('resume_parsed_data')
    .update({
      parsed_json: applied,
      version_id: version.id,
      updated_at: new Date().toISOString(),
    })
    .eq('resume_id', resumeId);

  await supabase
    .from('resumes')
    .update({ current_version_number: nextVersion })
    .eq('id', resumeId);

  return { parsed: applied, version, newVersionNumber: nextVersion };
}

/**
 * Restore an older version as the current structured representation.
 */
export async function restoreVersion({ supabase, resumeId, userId, versionId }) {
  const { data: version, error } = await supabase
    .from('resume_versions')
    .select('*')
    .eq('id', versionId)
    .eq('resume_id', resumeId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const { data: resume, error: rError } = await supabase
    .from('resumes')
    .select('current_version_number')
    .eq('id', resumeId)
    .single();
  if (rError) throw rError;

  const nextVersion = (resume.current_version_number || 1) + 1;

  const { data: newVersion, error: vError } = await supabase
    .from('resume_versions')
    .insert({
      resume_id: resumeId,
      user_id: userId,
      version_number: nextVersion,
      parsed_data: version.parsed_data,
      change_summary: `Restored from version ${version.version_number}`,
    })
    .select()
    .single();
  if (vError) throw vError;

  await supabase
    .from('resume_parsed_data')
    .update({ parsed_json: version.parsed_data, version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq('resume_id', resumeId);

  await supabase.from('resumes').update({ current_version_number: nextVersion }).eq('id', resumeId);

  return { version: newVersion, parsed: version.parsed_data };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESUME_PARSE_VERSION = 'resume-parse-v1';

/**
 * Fetch PDF from Supabase storage and extract text.
 * Uses pdfjs-dist (already a dependency) to parse text content.
 * @param {string} fileUrl - public URL of the uploaded PDF
 */
async function extractPdfText(fileUrl) {
  if (!fileUrl) throw new Error('No PDF file URL on resume');

  // Resolve to a fetchable URL (handle relative paths)
  const resolved = fileUrl.startsWith('http')
    ? fileUrl
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fileUrl.replace(/^\//, '')}`;

  const response = await fetch(resolved);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();

  // The modern pdfjs build requires a web worker which fails in Node.js
  // server runtimes. Prefer the legacy build (runs without a worker).
  let pdfjsLib;
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    pdfjsLib = await import('pdfjs-dist');
  }
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  }).promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (item.str || '').trimEnd())
      .join(' ');
    text += `\n${pageText}`;
  }

  return text.trim();
}

/**
 * Parse raw PDF text into canonical structured resume JSON via the LLM.
 * @param {string} pdfText
 */
async function parseResumeWithLlm(pdfText) {
  if (!pdfText || pdfText.trim().length < 30) {
    throw new Error('PDF contained no extractable text');
  }

  const prompt = buildParseResumePrompt(pdfText);
  const result = await completeJson(prompt);

  if (!result.data) {
    // Fallback: minimal canonical structure so the UI never hard-fails
    return {
      name: '',
      headline: null,
      email: null,
      phone: null,
      summary: pdfText.slice(0, 300),
      experience: [],
      projects: [],
      education: [],
      skills: [],
      certifications: [],
      publications: [],
      links: [],
      awards: [],
      languages: [],
      formatting_risk: 0.5,
      _parse_warning: 'LLM parsing unavailable; used raw text.',
    };
  }

  return normalizeParsedResume(result.data);
}

function normalizeParsedResume(data) {
  const arrayOf = (arr) => (Array.isArray(arr) ? arr : []);

  return {
    name: String(data.name || '').trim(),
    headline: data.headline ? String(data.headline) : null,
    email: data.email ? String(data.email).trim() : null,
    phone: data.phone ? String(data.phone).trim() : null,
    summary: String(data.summary || '').trim(),
    experience: arrayOf(data.experience).map((e) => ({
      company: String(e.company || '').trim(),
      title: String(e.title || '').trim(),
      location: e.location ? String(e.location) : null,
      date_range: e.date_range ? String(e.date_range) : null,
      bullets: arrayOf(e.bullets).map((b) => String(b).trim()),
      technologies: arrayOf(e.technologies).map((t) => String(t).trim()),
    })),
    projects: arrayOf(data.projects).map((p) => ({
      name: String(p.name || '').trim(),
      description: String(p.description || '').trim(),
      technologies: arrayOf(p.technologies).map((t) => String(t).trim()),
    })),
    education: arrayOf(data.education).map((ed) => ({
      school: String(ed.school || '').trim(),
      degree: String(ed.degree || '').trim(),
      graduation_year: ed.graduation_year ? String(ed.graduation_year) : null,
    })),
    skills: arrayOf(data.skills).map((s) => String(s).trim()).filter(Boolean),
    certifications: arrayOf(data.certifications).map((c) => String(c).trim()).filter(Boolean),
    publications: arrayOf(data.publications).map((p) => String(p).trim()).filter(Boolean),
    links: arrayOf(data.links).map((l) => String(l).trim()).filter(Boolean),
    awards: arrayOf(data.awards).map((a) => String(a).trim()).filter(Boolean),
    languages: arrayOf(data.languages).map((l) => String(l).trim()).filter(Boolean),
    formatting_risk: Number.isFinite(Number(data.formatting_risk)) ? clamp01(Number(data.formatting_risk)) : 0.3,
  };
}

function estimateParseConfidence(parsed) {
  let points = 0;
  if (parsed.name) points += 1;
  if (parsed.experience?.length) points += 1;
  if (parsed.education?.length) points += 1;
  if (parsed.skills?.length) points += 1;
  if (parsed.summary) points += 1;
  return clamp01(0.4 + points * 0.1);
}

/**
 * Apply a new value at a dot-notation field path.
 * Supports array indices like "experience[0].bullets[2]".
 * Returns a NEW object (immutable apply) or the same object if path invalid.
 */
export function applyFieldPath(obj, fieldPath, value) {
  if (!fieldPath) return obj;

  // Parse path segments, e.g. experience[0].bullets[2]
  const segments = String(fieldPath)
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  if (!segments.length) return obj;

  // Clone the root (shallow; deep paths mutate nested, acceptable for JSON snapshots)
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const nextKey = Number.isNaN(Number(segments[i + 1])) ? segments[i + 1] : Number(segments[i + 1]);

    if (Array.isArray(cursor[key])) {
      const idx = nextKey;
      if (cursor[key][idx] == null) cursor[key][idx] = {};
      cursor[key][idx] = { ...cursor[key][idx] };
      cursor = cursor[key][idx];
    } else {
      if (cursor[key] == null) cursor[key] = {};
      if (typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    }
  }

  const finalKey = segments[segments.length - 1];
  cursor[finalKey] = value;

  return clone;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

export { getAdminClient };
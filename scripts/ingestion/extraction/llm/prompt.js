/**
 * Build extraction-only prompt for one-shot canonical JSON.
 * @param {{ title: string, company?: string|null, location?: string|null, description?: string|null }} job
 * @param {string[]} weakFields
 */
export function buildExtractionPrompt(job, weakFields = []) {
  const weakNote = weakFields.length
    ? `Focus especially on these uncertain fields: ${weakFields.join(', ')}.`
    : '';

  return `You are an information extraction engine, not a chatbot.
Extract the job posting into JSON matching this schema exactly.
If a field is not explicitly stated in the job text, return null (or [] for arrays).
Do NOT infer, guess, or invent values.
Return valid JSON only. No markdown. No prose. No explanation.

${weakNote}

Schema fields:
{
  "employmentType": "full_time"|"part_time"|"contract"|"internship"|"temporary"|null,
  "workArrangement": "remote"|"hybrid"|"onsite"|null,
  "minimumExperience": number 0-40 or null,
  "maximumExperience": number 0-40 or null,
  "experienceLevel": "intern"|"new_grad"|"entry"|"mid"|"senior"|"staff"|"principal"|"director"|null,
  "requiredSkills": string[] or null,
  "preferredSkills": string[] or null,
  "technologies": string[] or null,
  "careerAreas": string[] of snake_case values like backend, frontend, ai, machine_learning, data, devops, cloud, security, product, design, sales, marketing, finance, legal, hr, operations, administration, it, hardware, quantitative, management, full_stack | null,
  "education": string or null,
  "salary": { "currency": string, "min": number, "max": number, "period": string } or null,
  "visaSponsorship": boolean or null
}

Job title: ${job.title || ''}
Company: ${job.company || ''}
Location: ${job.location || ''}

Job description:
${(job.description || '').slice(0, 12000)}
`;
}

/**
 * Build a batched extraction prompt — returns an array keyed by external_id.
 * ATS-native fields (title/company/location) are locked inputs.
 *
 * @param {Array<{ title: string, company?: string|null, location?: string|null, description?: string|null }>} jobs
 */
export function buildBatchExtractionPrompt(jobs) {
  const items = jobs
    .map(
      (job, i) => `### JOB ${i + 1} (external_id: "job_${i + 1}")
Title: ${job.title || ''}
Company: ${job.company || ''}
Location: ${job.location || ''}
Description:
${(job.description || '').slice(0, 6000)}`,
    )
    .join('\n\n');

  return `You are an information extraction engine, not a chatbot.
Extract EACH job posting into JSON matching the schema below.
For each job return one object. When a field is not explicitly stated, ESTIMATE the most likely value from the role's title, experience level, company, and description (e.g. years required from a "Senior" prefix, employment type from context, likely technologies implied by the stack). Use your best judgment rather than returning null.
The "title", "company", and "location" fields are LOCKED — copy them verbatim from the input, do not modify.
Return a single JSON object in this exact shape (no markdown, no prose):

{
  "items": [
    {
      "external_id": "job_1",
      "employmentType": "full_time"|"part_time"|"contract"|"internship"|"temporary"|null,
      "workArrangement": "remote"|"hybrid"|"onsite"|null,
      "minimumExperience": number 0-40 or null,
      "maximumExperience": number 0-40 or null,
      "experienceLevel": "intern"|"new_grad"|"entry"|"mid"|"senior"|"staff"|"principal"|"director"|null,
      "requiredSkills": string[] or null,
      "preferredSkills": string[] or null,
      "technologies": string[] or null,
      "careerAreas": string[] of snake_case values like backend, frontend, ai, machine_learning, data, devops, cloud, security, product, design, sales, marketing, finance, legal, hr, operations, administration, it, hardware, quantitative, management, full_stack | null,
      "education": string or null,
      "salary": { "currency": string, "min": number, "max": number, "period": string } or null,
      "visaSponsorship": boolean or null
    }
  ]
}

Jobs to extract (${jobs.length} total):

${items}
`;
}

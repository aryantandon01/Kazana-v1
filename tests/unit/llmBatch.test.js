import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  parseCompletionContent,
  completeJsonDeepseek,
} from '../../scripts/ingestion/extraction/llm/deepseek.js';
import { buildBatchExtractionPrompt } from '../../scripts/ingestion/extraction/llm/prompt.js';
import { runExtractionBatch } from '../../scripts/ingestion/extraction/llm/batch.js';
import { runExtraction } from '../../scripts/ingestion/extraction/runExtraction.js';

const ORIGINAL_BATCH_SIZE = process.env.EXTRACTION_BATCH_SIZE;
const ORIGINAL_API_KEY = process.env.DEEPSEEK_API_KEY;
const ORIGINAL_RETRY_BASE = process.env.DEEPSEEK_RETRY_BASE_MS;

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv('EXTRACTION_BATCH_SIZE', ORIGINAL_BATCH_SIZE);
  restoreEnv('DEEPSEEK_API_KEY', ORIGINAL_API_KEY);
  restoreEnv('DEEPSEEK_RETRY_BASE_MS', ORIGINAL_RETRY_BASE);
});

function restoreEnv(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

describe('parseCompletionContent', () => {
  it('preserves a batched `items` response instead of stripping it', () => {
    const content = JSON.stringify({
      items: [{ external_id: '7817118003', requiredSkills: ['Python'] }],
    });

    const result = parseCompletionContent(content, 'deepseek-v4-flash', { total_tokens: 10 });

    expect(Array.isArray(result.data.items)).toBe(true);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].external_id).toBe('7817118003');
    expect(result.data.items[0].requiredSkills).toEqual(['Python']);
  });

  it('keeps numeric external_ids returned as JSON numbers', () => {
    const content = JSON.stringify({ items: [{ external_id: 42, employmentType: 'full_time' }] });

    const result = parseCompletionContent(content, 'm');

    expect(result.data.items[0].external_id).toBe(42);
  });

  it('keeps items even if strict validation fails for one field', () => {
    // Invalid enum would fail batchExtractionResponseSchema — raw items survive
    // so downstream validate.js can clamp instead of losing the whole chunk.
    const content = JSON.stringify({
      items: [{ external_id: '1', employmentType: 'FULLTIME' }],
    });

    const result = parseCompletionContent(content, 'm');

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].external_id).toBe('1');
  });

  it('still parses a single-job response without an items array', () => {
    const content = JSON.stringify({ requiredSkills: ['Go'] });

    const result = parseCompletionContent(content, 'm');

    expect(result.data.items).toBeUndefined();
    expect(result.data.requiredSkills).toEqual(['Go']);
  });

  it('returns null data for malformed JSON', () => {
    const result = parseCompletionContent('not json at all', 'm');
    expect(result.data).toBeNull();
  });
});

describe('buildBatchExtractionPrompt', () => {
  it('uses the real external_id in the job header and echo instruction', () => {
    const prompt = buildBatchExtractionPrompt([
      {
        externalId: '7817118003',
        title: 'Senior Backend Engineer',
        company: 'Acme',
        location: 'Remote',
        description: 'Build APIs.',
      },
      {
        externalId: '42',
        title: 'Data Scientist',
        company: 'Acme',
        location: 'NYC',
        description: 'Model things.',
      },
    ]);

    expect(prompt).toContain('external_id: "7817118003"');
    expect(prompt).toContain('external_id: "42"');
    // No synthetic job_N ids that would never match the pipeline's lookup.
    expect(prompt).not.toContain('job_1');
    expect(prompt).toContain('copy the exact external_id');
  });

  it('renders ATS structured fields as locked inputs', () => {
    const prompt = buildBatchExtractionPrompt([
      {
        externalId: '1',
        title: 'Backend Engineer',
        yearsRequired: 5,
        employmentType: 'full_time',
        workArrangement: 'remote',
        salary: { currency: 'USD', min: 100000 },
        tags: ['backend', 'python'],
      },
    ]);

    expect(prompt).toContain('ATS locked — years required: 5');
    expect(prompt).toContain('ATS locked — employment type: full_time');
    expect(prompt).toContain('ATS locked — work arrangement: remote');
    expect(prompt).toContain('ATS locked — salary: {"currency":"USD","min":100000}');
    expect(prompt).toContain('ATS tags: backend, python');
  });

  it('omits locked lines when ATS fields are missing', () => {
    const prompt = buildBatchExtractionPrompt([
      { externalId: '1', title: 'Engineer', yearsRequired: null, tags: [] },
    ]);

    expect(prompt).not.toContain('ATS locked —');
    expect(prompt).not.toContain('ATS tags');
  });
});

describe('runExtractionBatch', () => {
  const jobs = ['1', '2', '3', '4', '5'].map((id) => ({
    externalId: id,
    title: `Job ${id}`,
    company: 'Acme',
    location: 'Remote',
    description: 'Build things.',
  }));

  it('maps returned items by real external_id and strips the routing key', async () => {
    process.env.EXTRACTION_BATCH_SIZE = '5';
    const provider = {
      async completeJson() {
        return {
          data: {
            items: jobs.map((job) => ({
              external_id: job.externalId,
              requiredSkills: ['Python'],
            })),
          },
          model: 'fake-model',
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        };
      },
    };

    const result = await runExtractionBatch(jobs, { provider });

    expect(result.llmCalls).toBe(1);
    expect(result.model).toBe('fake-model');
    expect(result.errors).toEqual([]);
    expect([...result.llmValuesByExternalId.keys()].sort()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(result.llmValuesByExternalId.get('1').requiredSkills).toEqual(['Python']);
    expect(result.llmValuesByExternalId.get('1').external_id).toBeUndefined();
    expect(result.llmUsageTotals.calls).toBe(1);
    expect(result.llmUsageTotals.total_tokens).toBe(150);
  });

  it('splits jobs into chunks using EXTRACTION_BATCH_SIZE', async () => {
    process.env.EXTRACTION_BATCH_SIZE = '2';
    let prompts = 0;
    const provider = {
      async completeJson(prompt) {
        prompts += 1;
        // Echo back every external_id present in the prompt.
        const ids = [...prompt.matchAll(/external_id: "([^"]+)"/g)].map((m) => m[1]);
        return {
          data: { items: ids.map((id) => ({ external_id: id })) },
          model: 'fake-model',
        };
      },
    };

    const result = await runExtractionBatch(jobs, { provider });

    expect(prompts).toBe(3);
    expect(result.llmCalls).toBe(3);
    expect(result.llmValuesByExternalId.size).toBe(5);
  });

  it('reports missing external_ids but keeps the rest of the chunk', async () => {
    process.env.EXTRACTION_BATCH_SIZE = '5';
    const provider = {
      async completeJson() {
        return {
          data: {
            items: [
              { external_id: '1', requiredSkills: ['Python'] },
              { external_id: '2', requiredSkills: ['Go'] },
            ],
          },
          model: 'fake-model',
        };
      },
    };

    const result = await runExtractionBatch(jobs, { provider });

    expect(result.llmValuesByExternalId.has('1')).toBe(true);
    expect(result.llmValuesByExternalId.has('2')).toBe(true);
    expect(result.llmValuesByExternalId.has('3')).toBe(false);
    expect(result.errors.some((e) => e.includes('missing external_id 3'))).toBe(true);
  });

  it('records a chunk error when the provider throws', async () => {
    process.env.EXTRACTION_BATCH_SIZE = '5';
    const provider = {
      async completeJson() {
        throw new Error('fetch failed');
      },
    };

    const result = await runExtractionBatch(jobs, { provider });

    expect(result.llmCalls).toBe(0);
    expect(result.llmValuesByExternalId.size).toBe(0);
    expect(result.errors[0]).toContain('fetch failed');
  });

  it('records an error when the response has no items array', async () => {
    process.env.EXTRACTION_BATCH_SIZE = '5';
    const provider = {
      async completeJson() {
        return { data: { results: [] }, model: 'fake-model' };
      },
    };

    const result = await runExtractionBatch(jobs, { provider });

    expect(result.llmValuesByExternalId.size).toBe(0);
    expect(result.errors[0]).toContain('returned no items array');
  });
});

describe('runExtraction with batched llmValues', () => {
  it('merges batched LLM values without issuing a per-job call', async () => {
    const ctx = {
      title: 'Senior Backend Engineer',
      description: 'Build distributed services.',
      location: 'Remote',
      company: 'Acme',
      url: null,
      ats: {},
    };

    const result = await runExtraction(ctx, {
      llmValues: { requiredSkills: ['Python', 'Kubernetes'], experienceLevel: 'senior' },
      llmModel: 'fake-model',
    });

    expect(result.meta.llm_called).toBe(true);
    expect(result.meta.llm_source).toBe('batch');
    expect(result.meta.llm_usage).toBeNull();
    expect(result.canonical.title).toBe('Senior Backend Engineer');
    expect(result.canonical.requiredSkills).toContain('Python');
    expect(result.canonical.requiredSkills).toContain('Kubernetes');
  });

  it('keeps ATS structured fields over batched LLM values', async () => {
    const ctx = {
      title: 'Backend Engineer',
      description: '',
      location: 'NYC',
      company: 'Acme',
      url: null,
      ats: { years_required: 5, employmentType: 'full_time' },
    };

    const result = await runExtraction(ctx, {
      llmValues: { minimumExperience: 2, employmentType: 'contract' },
      llmModel: 'fake-model',
    });

    expect(result.canonical.minimumExperience).toBe(5);
    expect(result.canonical.employmentType).toBe('full_time');
  });
});

describe('completeJsonDeepseek retry behavior', () => {
  function jsonResponse(content) {
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { total_tokens: 5 },
      }),
    };
  }

  it('retries a transient network error, then succeeds', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_RETRY_BASE_MS = '0';
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return jsonResponse({ requiredSkills: ['Go'] });
    });

    const result = await completeJsonDeepseek('prompt');

    expect(calls).toBe(2);
    expect(result.data.requiredSkills).toEqual(['Go']);
  });

  it('retries 5xx up to the attempt cap', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_RETRY_BASE_MS = '0';
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return { ok: false, status: 503, text: async () => 'unavailable' };
    });

    await expect(completeJsonDeepseek('prompt')).rejects.toThrow(/503/);
    expect(calls).toBe(3);
  });

  it('does not retry a permanent 4xx error', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_RETRY_BASE_MS = '0';
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return { ok: false, status: 401, text: async () => 'unauthorized' };
    });

    await expect(completeJsonDeepseek('prompt')).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });
});




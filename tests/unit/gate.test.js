import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the gate's dependencies so we can test its orchestration in isolation.
const mocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  finalizeCreditOperation: vi.fn(),
  releaseCreditOperation: vi.fn(),
  recordAiUsage: vi.fn(),
  getOperation: vi.fn(),
  canUseFeature: vi.fn(),
}));

vi.mock('@/lib/credits/ledger', () => ({
  reserveCredits: mocks.reserveCredits,
  finalizeCreditOperation: mocks.finalizeCreditOperation,
  releaseCreditOperation: mocks.releaseCreditOperation,
}));
vi.mock('@/lib/credits/usage', () => ({
  recordAiUsage: mocks.recordAiUsage,
}));
vi.mock('@/lib/credits/catalog', () => ({
  getOperation: mocks.getOperation,
}));
vi.mock('@/lib/credits/entitlements', () => ({
  canUseFeature: mocks.canUseFeature,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    mock: true,
    from: () => ({ update: () => ({ eq: () => ({}) }) }),
  }),
}));

import { runWithCredits } from '@/lib/credits/gate';
import { CreditsError } from '@/lib/credits/errors';

const USER = 'user-1';
const OP = 'resume_optimization';
const KEY = 'idem-key-1';

const baseOp = { slug: OP, display_name: 'Resume Optimization', feature: 'resume_optimization', credit_cost: 5, enabled: true, min_plan_slug: null };

function fakeResult(overrides = {}) {
  return {
    data: { analysis: 'ok', suggestions: [] },
    model: 'deepseek-v4-flash',
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    provider: 'deepseek',
    ...overrides,
  };
}

describe('AI credit gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOperation.mockResolvedValue({ ...baseOp });
    mocks.reserveCredits.mockResolvedValue({
      is_new: true,
      status: 'reserved',
      operation: { id: 'op-1', credit_transaction_id: 'tx-1', credit_amount: 5 },
    });
    mocks.finalizeCreditOperation.mockResolvedValue({ id: 'op-1', status: 'consumed' });
    mocks.releaseCreditOperation.mockResolvedValue({ id: 'op-1', status: 'refunded' });
    mocks.recordAiUsage.mockResolvedValue({ id: 'usage-1' });
  });

  it('reserves → runs → records usage → finalizes for a paid operation', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult());
    const out = await runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, referenceId: 'ref', run });

    expect(mocks.reserveCredits).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER, operationSlug: OP, amount: 5, idempotencyKey: KEY }),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER, operationSlug: OP, inputTokens: 100, outputTokens: 50, totalTokens: 150, creditOperationId: 'op-1' }),
    );
    expect(mocks.finalizeCreditOperation).toHaveBeenCalledWith(expect.anything(), 'op-1');
    expect(mocks.releaseCreditOperation).not.toHaveBeenCalled();
    expect(out.data).toEqual({ analysis: 'ok', suggestions: [] });
  });

  it('does not reserve/finalize for free operations, but still records usage', async () => {
    mocks.getOperation.mockResolvedValue({ ...baseOp, credit_cost: 0 });
    const run = vi.fn().mockResolvedValue(fakeResult());

    await runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run });

    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.finalizeCreditOperation).not.toHaveBeenCalled();
    expect(mocks.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('propagates insufficient-credits without calling the AI', async () => {
    mocks.reserveCredits.mockRejectedValue(
      new CreditsError('INSUFFICIENT_CREDITS', 'Insufficient AI credits.', { required: 5, available: 2 }),
    );
    const run = vi.fn();

    await expect(
      runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refunds the reservation when the AI call throws', async () => {
    const boom = new Error('DeepSeek timeout');
    const run = vi.fn().mockRejectedValue(boom);

    await expect(
      runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run }),
    ).rejects.toBe(boom);
    expect(mocks.releaseCreditOperation).toHaveBeenCalledWith(expect.anything(), 'op-1', 'ai_failure');
    expect(mocks.finalizeCreditOperation).not.toHaveBeenCalled();
  });

  it('refunds when the provider did not actually run (no API key / model none)', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult({ data: null, model: 'none' }));

    const out = await runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run });

    expect(out.model).toBe('none');
    expect(mocks.releaseCreditOperation).toHaveBeenCalledWith(expect.anything(), 'op-1', 'no_ai_consumption');
    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(mocks.finalizeCreditOperation).not.toHaveBeenCalled();
  });

  it('blocks idempotent replays of already-completed operations', async () => {
    mocks.reserveCredits.mockResolvedValue({
      is_new: false,
      status: 'consumed',
      operation: { id: 'op-1', status: 'consumed' },
    });
    const run = vi.fn();

    await expect(
      runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENT_REPLAY' });
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects disabled operations without touching the ledger', async () => {
    mocks.getOperation.mockResolvedValue({ ...baseOp, enabled: false });
    const run = vi.fn();

    await expect(
      runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run }),
    ).rejects.toMatchObject({ code: 'OPERATION_DISABLED' });
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('enforces the plan gate when an operation requires a plan', async () => {
    mocks.getOperation.mockResolvedValue({ ...baseOp, min_plan_slug: 'premium' });
    mocks.canUseFeature.mockResolvedValue(false);
    const run = vi.fn();

    await expect(
      runWithCredits({ userId: USER, operationSlug: OP, idempotencyKey: KEY, run }),
    ).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});


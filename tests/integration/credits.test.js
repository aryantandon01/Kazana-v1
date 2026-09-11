/**
 * Credit system integration tests — run against a REAL Supabase project.
 *
 * Required env (see .env.example):
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   TEST_SUPABASE_SERVICE_ROLE_KEY
 *
 * Prerequisite: db/migrations/20260901010000_ai_credits_entitlements.sql must
 * be applied to the test project. Tests create (and clean up) isolated users.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import '@/lib/loadEnv';
import * as ledger from '@/lib/credits/ledger';
import { runWithCredits } from '@/lib/credits/gate';
import { refreshCatalog } from '@/lib/credits/catalog';
import { CreditsError } from '@/lib/credits/errors';

const URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
const KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

const admin = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;

const createdUserIds = [];

async function createUser(tag) {
  const email = `credit-test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kazana.test`;
  const password = 'Kazana-Test-123!';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function deleteUser(id) {
  await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function signInAs(user) {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signInAs failed: ${error.message}`);
  return client;
}

async function balanceOf(userId) {
  const b = await ledger.getBalance(admin, userId);
  return b ? Number(b.available_credits) : 0;
}

function fakeRunResult() {
  return {
    data: { analysis: 'test', suggestions: [] },
    model: 'deepseek-v4-flash',
    usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    provider: 'deepseek',
  };
}

const describeEnv = URL && KEY && ANON_KEY ? describe : describe.skip;

describeEnv('Kazana AI Credits — database integrity', () => {
  beforeAll(async () => {
    const { error } = await admin.from('ai_operations').select('slug').limit(1);
    if (error) {
      throw new Error(
        `Credit schema not found in the test project. Apply db/migrations/20260901010000_ai_credits_entitlements.sql first. (${error.message})`,
      );
    }
    refreshCatalog();
  });

  afterAll(async () => {
    for (const id of createdUserIds) await deleteUser(id);
  });

  it('TEST 1: a new user receives the configured welcome grant', async () => {
    const user = await createUser('welcome');
    const { data: plans } = await admin.from('plans').select('slug, welcome_credit_grant').eq('slug', 'free').single();
    const expected = Number(plans?.welcome_credit_grant) || 0;
    expect(await balanceOf(user.id)).toBe(expected);
  });

  it('TEST 2: the balance reflects grants exactly', async () => {
    const user = await createUser('balance');
    const before = await balanceOf(user.id);
    await ledger.grantCredits(admin, {
      userId: user.id,
      amount: 50,
      type: 'promotional_bonus',
      referenceId: `promo-${user.id}`,
      idempotencyKey: `promo-${user.id}`,
    });
    expect(await balanceOf(user.id)).toBe(before + 50);
  });

  it('TEST 3: a 5-credit operation deducts exactly 5', async () => {
    const user = await createUser('deduct');
    const before = await balanceOf(user.id);
    const res = await ledger.reserveCredits(admin, {
      userId: user.id,
      operationSlug: 'resume_optimization',
      amount: 5,
      idempotencyKey: `deduct-${Date.now()}`,
      referenceId: 'test-3',
    });
    expect(res.is_new).toBe(true);
    await ledger.finalizeCreditOperation(admin, res.operation.id);
    expect(await balanceOf(user.id)).toBe(before - 5);
  });

  it('TEST 4: insufficient credits reject the operation', async () => {
    const user = await createUser('insufficient');
    await expect(
      ledger.reserveCredits(admin, {
        userId: user.id,
        operationSlug: 'resume_optimization',
        amount: 1_000_000,
        idempotencyKey: `insufficient-${Date.now()}`,
        referenceId: 'test-4',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  });

  it('TEST 5: credits never go negative', async () => {
    const user = await createUser('negative');
    const before = await balanceOf(user.id);
    try {
      await ledger.reserveCredits(admin, {
        userId: user.id,
        operationSlug: 'resume_optimization',
        amount: before + 999,
        idempotencyKey: `negative-${Date.now()}`,
        referenceId: 'test-5',
      });
    } catch {
      // expected
    }
    expect(await balanceOf(user.id)).toBeGreaterThanOrEqual(0);
    expect(await balanceOf(user.id)).toBe(before);
  });

  it('TEST 6: concurrent requests cannot double-spend credits', async () => {
    const user = await createUser('concurrent');
    const welcome = await balanceOf(user.id);
    // Normalize the balance to exactly 10 credits.
    if (welcome !== 10) {
      await ledger.adjustCredits(admin, { userId: user.id, amount: 10 - welcome, reason: 'test setup' });
    }
    expect(await balanceOf(user.id)).toBe(10);

    const attempts = Array.from({ length: 10 }, (_, i) =>
      ledger.reserveCredits(admin, {
        userId: user.id,
        operationSlug: 'resume_optimization',
        amount: 5,
        idempotencyKey: `concurrent-${Date.now()}-${i}`,
        referenceId: 'test-6',
      }),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(succeeded.length).toBe(2); // 10 credits / 5 per reserve
    expect(rejected.length).toBe(8);
    for (const r of rejected) expect(r.reason?.code).toBe('INSUFFICIENT_CREDITS');
    expect(await balanceOf(user.id)).toBe(0);
  });

  it('TEST 7 & 12: a failed AI request refunds the reservation via a compensating transaction', async () => {
    const user = await createUser('refund');
    const before = await balanceOf(user.id);

    const res = await ledger.reserveCredits(admin, {
      userId: user.id,
      operationSlug: 'resume_optimization',
      amount: 5,
      idempotencyKey: `refund-${Date.now()}`,
      referenceId: 'test-7',
    });
    expect(await balanceOf(user.id)).toBe(before - 5);

    await ledger.releaseCreditOperation(admin, res.operation.id, 'ai_failure');
    expect(await balanceOf(user.id)).toBe(before); // restored

    const { data: txs } = await admin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('transaction_type', 'refund');
    expect(txs.some((tx) => tx.amount === 5 && tx.metadata?.operation_id === res.operation.id)).toBe(true);

    const { data: op } = await admin
      .from('credit_operations')
      .select('status, refund_transaction_id')
      .eq('id', res.operation.id)
      .single();
    expect(op.status).toBe('refunded');
    expect(op.refund_transaction_id).toBeTruthy();
  });

  it('TEST 8: retrying with the same idempotency key does not double-charge', async () => {
    const user = await createUser('idem');
    const key = `idem-${Date.now()}`;

    const first = await ledger.reserveCredits(admin, {
      userId: user.id,
      operationSlug: 'resume_optimization',
      amount: 5,
      idempotencyKey: key,
      referenceId: 'test-8',
    });
    const second = await ledger.reserveCredits(admin, {
      userId: user.id,
      operationSlug: 'resume_optimization',
      amount: 5,
      idempotencyKey: key,
      referenceId: 'test-8',
    });

    expect(second.is_new).toBe(false);
    expect(second.operation.id).toBe(first.operation.id);

    const { data: usageTxs } = await admin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('transaction_type', 'usage')
      .eq('reference_id', 'test-8');
    expect(usageTxs.length).toBe(1); // charged once
  });


  it('TEST 9: the monthly Premium grant is issued exactly once', async () => {
    const user = await createUser('monthly');
    const { data: premium } = await admin
      .from('plans')
      .select('id, monthly_credit_grant')
      .eq('slug', 'premium')
      .single();
    const periodStart = '2026-09-01T00:00:00Z';
    const periodEnd = '2026-10-01T00:00:00Z';

    const { data: sub } = await admin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: premium.id,
        provider: 'manual',
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
      })
      .select()
      .single();

    const before = await balanceOf(user.id);
    await admin.rpc('process_monthly_grants');
    await admin.rpc('process_monthly_grants'); // retry — must not double-grant

    expect(await balanceOf(user.id)).toBe(before + Number(premium.monthly_credit_grant));

    const { data: grants } = await admin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('transaction_type', 'subscription_grant')
      .eq('reference_id', `subscription:${sub.id}:${periodStart}`);
    expect(grants.length).toBe(1);
  });

  it('TEST 10: a repeated webhook grant with the same reference does not grant twice', async () => {
    const user = await createUser('webhook');
    const before = await balanceOf(user.id);

    const g1 = await ledger.grantCredits(admin, {
      userId: user.id,
      amount: 100,
      type: 'subscription_grant',
      referenceId: 'subscription:wh:2026-09',
      idempotencyKey: 'subgrant:wh:2026-09',
    });
    const g2 = await ledger.grantCredits(admin, {
      userId: user.id,
      amount: 100,
      type: 'subscription_grant',
      referenceId: 'subscription:wh:2026-09',
      idempotencyKey: 'subgrant:wh:2026-09',
    });

    expect(g1).toBeTruthy();
    expect(g2).toBeNull(); // idempotent replay
    expect(await balanceOf(user.id)).toBe(before + 100);
  });

  it('TEST 11: expired credits cannot be consumed', async () => {
    const user = await createUser('expiry');
    const welcome = await balanceOf(user.id);

    await ledger.grantCredits(admin, {
      userId: user.id,
      amount: 50,
      type: 'promotional_bonus',
      referenceId: `exp-${user.id}`,
      idempotencyKey: `exp-${user.id}`,
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // already expired
    });
    // Balance includes the expiring grant until reconciliation runs.
    expect(await balanceOf(user.id)).toBe(welcome + 50);

    await ledger.expireCredits(admin, user.id);
    // Expired credits are excluded — only the non-expiring welcome grant remains.
    expect(await balanceOf(user.id)).toBe(welcome);

    await expect(
      ledger.reserveCredits(admin, {
        userId: user.id,
        operationSlug: 'resume_optimization',
        amount: welcome + 1,
        idempotencyKey: `expiry-${Date.now()}`,
        referenceId: 'test-11',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  });


  it('TEST 13: a user cannot read another user\'s transactions', async () => {
    const userA = await createUser('rls-a');
    const userB = await createUser('rls-b');

    // Give A some ledger history.
    await ledger.grantCredits(admin, {
      userId: userA.id,
      amount: 7,
      type: 'promotional_bonus',
      referenceId: `rls-a-${userA.id}`,
      idempotencyKey: `rls-a-${userA.id}`,
    });

    const clientB = await signInAs(userB);
    const { data: txs } = await clientB
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userA.id);
    expect((txs || []).length).toBe(0);

    // B can still read their own ledger.
    const { data: ownTxs } = await clientB.from('credit_transactions').select('*').eq('user_id', userB.id);
    expect(Array.isArray(ownTxs)).toBe(true);
  });

  it('TEST 14: a user cannot create or modify their own credit transactions', async () => {
    const user = await createUser('rls-write');
    const client = await signInAs(user);

    const { error: insertErr } = await client.from('credit_transactions').insert({
      user_id: user.id,
      amount: 999999,
      transaction_type: 'grant',
    });
    expect(insertErr).toBeTruthy(); // RLS: no insert policy

    const { error: updateErr } = await client
      .from('user_credits')
      .update({ available_credits: 999999 })
      .eq('user_id', user.id);
    expect(updateErr).toBeTruthy(); // RLS: no update policy
  });

  it('TEST 15: a client cannot claim Premium', async () => {
    const user = await createUser('rls-premium');
    const client = await signInAs(user);

    const { data: plans } = await admin.from('plans').select('id').eq('slug', 'premium').single();
    const { error } = await client.from('subscriptions').insert({
      user_id: user.id,
      plan_id: plans.id,
      provider: 'manual',
      status: 'active',
    });
    expect(error).toBeTruthy(); // RLS: no insert policy on subscriptions
  });

  it('TEST 16 & 17: resume analysis is free — the gate runs without consuming credits', async () => {
    const user = await createUser('free-analysis');
    const before = await balanceOf(user.id);

    const result = await runWithCredits({
      userId: user.id,
      operationSlug: 'resume_analysis',
      idempotencyKey: `analysis-${Date.now()}`,
      referenceId: 'test-16',
      admin,
      run: async () => fakeRunResult(),
    });

    expect(result.model).toBe('deepseek-v4-flash');
    expect(await balanceOf(user.id)).toBe(before); // cost 0 → no deduction

    const { data: usage } = await admin
      .from('ai_usage')
      .select('*')
      .eq('user_id', user.id)
      .eq('operation_slug', 'resume_analysis');
    expect(usage.length).toBe(1); // usage is still recorded for unit economics
    expect(Number(usage[0].total_tokens)).toBe(60);
  });

  it('TEST 18: resume optimization correctly invokes the credit gate (consume + record usage)', async () => {
    const user = await createUser('copilot-gate');
    const before = await balanceOf(user.id);

    const result = await runWithCredits({
      userId: user.id,
      operationSlug: 'resume_optimization',
      idempotencyKey: `optimize-${Date.now()}`,
      referenceId: 'test-18',
      admin,
      run: async () => fakeRunResult(),
    });

    expect(result.model).toBe('deepseek-v4-flash');
    expect(await balanceOf(user.id)).toBe(before - 5);

    const { data: ops } = await admin
      .from('credit_operations')
      .select('status, credit_amount, ai_usage_id, credit_transaction_id')
      .eq('user_id', user.id)
      .eq('operation_slug', 'resume_optimization');
    expect(ops.length).toBe(1);
    expect(ops[0].status).toBe('consumed');
    expect(Number(ops[0].credit_amount)).toBe(5);
    expect(ops[0].ai_usage_id).toBeTruthy();

    const { data: usage } = await admin
      .from('ai_usage')
      .select('*')
      .eq('id', ops[0].ai_usage_id)
      .single();
    expect(usage.credit_operation_id).toBe(ops[0].id);
    expect(usage.credit_transaction_id).toBe(ops[0].credit_transaction_id);
    expect(usage.model).toBe('deepseek-v4-flash');
  });
});


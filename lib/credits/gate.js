/**
 * The AI Credit Gate — the ONLY way billable AI operations run.
 *
 * Flow: resolve operation → entitlement check → resolve cost → atomic
 * reserve → run AI → record ai_usage → finalize (or refund on failure).
 *
 * Retries with the same idempotencyKey can never double-charge; AI failures
 * automatically release the reservation (credits are restored).
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { getOperation } from './catalog';
import { reserveCredits, finalizeCreditOperation, releaseCreditOperation } from './ledger';
import { recordAiUsage } from './usage';
import { canUseFeature } from './entitlements';
import { CreditsError, CREDITS_ERROR_CODES } from './errors';

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.operationSlug  - key into ai_operations
 * @param {string} params.idempotencyKey - client-generated uuid for this action
 * @param {string|null} [params.referenceId] - domain id (session id, resume id…)
 * @param {string|null} [params.feature] - overrides the catalog feature
 * @param {function(): Promise<{data: object|null, model: string|null, usage?: object, provider?: string|null}>} params.run
 * @param {object|null} [params.admin] - service-role client (injected for tests)
 */
export async function runWithCredits({
  userId,
  operationSlug,
  idempotencyKey,
  referenceId = null,
  feature = null,
  run,
  admin = null,
}) {
  const client = admin || getAdminClient();

  // 1. Resolve the operation + its configured credit cost (never hardcoded).
  const op = await getOperation(operationSlug, client);
  if (!op) {
    throw new CreditsError(
      CREDITS_ERROR_CODES.OPERATION_NOT_FOUND,
      `AI operation "${operationSlug}" is not configured.`,
    );
  }
  if (!op.enabled) {
    throw new CreditsError(
      CREDITS_ERROR_CODES.OPERATION_DISABLED,
      `"${op.display_name}" is temporarily disabled.`,
    );
  }
  const cost = Number(op.credit_cost) || 0;
  const resolvedFeature = feature || op.feature;

  // 2. Entitlement gate (only when the operation demands a plan).
  if (op.min_plan_slug) {
    const can = await canUseFeature(client, userId, op.feature);
    if (!can) {
      throw new CreditsError(
        CREDITS_ERROR_CODES.PLAN_REQUIRED,
        `"${op.display_name}" requires an upgraded plan.`,
      );
    }
  }

  // 3. Atomically reserve credits (skipped entirely for free operations).
  let operation = null;
  if (cost > 0) {
    const reservation = await reserveCredits(client, {
      userId,
      operationSlug,
      amount: cost,
      idempotencyKey,
      referenceId,
      feature: resolvedFeature,
    });
    operation = reservation.operation;
    if (!reservation.is_new && reservation.status !== 'reserved') {
      throw new CreditsError(
        CREDITS_ERROR_CODES.IDEMPOTENT_REPLAY,
        'This action was already completed. Please refresh the page.',
      );
    }
  }

  // 4. Run the AI call, then finalize or refund.
  try {
    const result = await run();

    // The provider returns model 'none' when no API key is configured — the AI
    // did not actually run, so a paid reservation must not be charged.
    const aiRan = Boolean(result?.model && result.model !== 'none');
    if (!aiRan && cost > 0 && operation) {
      await releaseCreditOperation(client, operation.id, 'no_ai_consumption');
      return result;
    }

    // 5. Record actual AI usage (never breaks the user-facing feature).
    if (aiRan) {
      try {
        const usage = result?.usage || {};
        const inputTokens = usage?.prompt_tokens ?? 0;
        const outputTokens = usage?.completion_tokens ?? 0;
        const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;

        const usageRow = await recordAiUsage(client, {
          userId,
          operationSlug,
          feature: resolvedFeature,
          provider: result?.provider || op.provider || null,
          model: result?.model || op.model || null,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost: null,
          creditOperationId: operation?.id || null,
          creditTransactionId: operation?.credit_transaction_id || null,
          referenceId,
        });

        if (operation && usageRow) {
          await client
            .from('credit_operations')
            .update({ ai_usage_id: usageRow.id })
            .eq('id', operation.id);
        }
      } catch (usageErr) {
        console.error('recordAiUsage failed', usageErr?.message || usageErr);
      }
    }

    // 6. Finalize the reservation (ledger already holds the debit).
    if (cost > 0 && operation) {
      await finalizeCreditOperation(client, operation.id);
    }

    return result;
  } catch (err) {
    // 7. Refund the reservation on ANY failure (timeouts, crashes, bad output).
    if (cost > 0 && operation) {
      await releaseCreditOperation(client, operation.id, 'ai_failure').catch((releaseErr) => {
        console.error('credit_release failed', releaseErr?.message || releaseErr);
      });
    }
    throw err;
  }
}

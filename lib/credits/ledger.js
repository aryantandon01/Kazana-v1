/**
 * Credit ledger service — the ONLY application-level interface to credit
 * mutations. Every function calls a SECURITY DEFINER RPC with the service
 * role client, so atomicity, idempotency, and the no-negative invariant are
 * enforced by the database, never by application code.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { creditsErrorFromRpc } from './errors';

function resolveAdmin(admin) {
  return admin || getAdminClient();
}

/**
 * Current balance + active plan for a user.
 * @returns {Promise<{ available_credits: number, reserved_credits: number, plan_slug: string, plan_name: string, plan_price: number, plan_currency: string, monthly_credit_grant: number }|null>}
 */
export async function getBalance(admin, userId) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('get_credit_balance', { p_user_id: userId });
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

/**
 * Grant credits (positive ledger row + cache update). Idempotent when the
 * same idempotencyKey or (type, referenceId) is reused.
 * @returns {Promise<string|null>} transaction id, or null on idempotent replay
 */
export async function grantCredits(
  admin,
  {
    userId,
    amount,
    type = 'grant',
    feature = null,
    referenceId = null,
    idempotencyKey = null,
    expiresAt = null,
    metadata = null,
    createdBy = 'system',
  }
) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_grant', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_feature: feature,
    p_reference_id: referenceId,
    p_idempotency_key: idempotencyKey,
    p_expires_at: expiresAt,
    p_metadata: metadata,
    p_created_by: createdBy,
  });
  if (error) throw creditsErrorFromRpc(error);
  return data; // uuid or null (idempotent replay)
}

/**
 * Atomically reserve credits for an AI operation. Debits the ledger
 * immediately; call finalizeCreditOperation() on success or
 * releaseCreditOperation() on failure.
 * @returns {Promise<{ is_new: boolean, status: string, operation: object }>}
 */
export async function reserveCredits(
  admin,
  { userId, operationSlug, amount, idempotencyKey, referenceId = null, feature = null }
) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_reserve', {
    p_user_id: userId,
    p_operation_slug: operationSlug,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
    p_reference_id: referenceId,
    p_feature: feature,
  });
  if (error) throw creditsErrorFromRpc(error);
  return data;
}

/** Mark a reservation consumed after the AI call succeeded. */
export async function finalizeCreditOperation(admin, operationId) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_finalize', { p_operation_id: operationId });
  if (error) throw creditsErrorFromRpc(error);
  return data;
}

/** Refund a reservation after the AI call failed (compensating ledger row). */
export async function releaseCreditOperation(admin, operationId, reason = 'ai_failure') {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_release', {
    p_operation_id: operationId,
    p_reason: reason,
    p_created_by: 'system',
  });
  if (error) throw creditsErrorFromRpc(error);
  return data;
}

/** Materialize expired credits as auditable expiration rows. */
export async function expireCredits(admin, userId = null) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_expire', { p_user_id: userId });
  if (error) throw error;
  return data;
}

/** Admin adjustment — signed amount; negative clawbacks can never go below zero. */
export async function adjustCredits(
  admin,
  { userId, amount, referenceId = null, reason = null, createdBy = 'admin' }
) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_adjust', {
    p_user_id: userId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_reason: reason,
    p_created_by: createdBy,
  });
  if (error) throw creditsErrorFromRpc(error);
  return data;
}

/** Recompute the cached balance from the ledger (tests / reconciliation). */
export async function reconcileUser(admin, userId) {
  const client = resolveAdmin(admin);
  const { data, error } = await client.rpc('credit_reconcile_user', { p_user_id: userId });
  if (error) throw error;
  return data;
}

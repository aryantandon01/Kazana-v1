/**
 * AI usage tracking — records actual provider/model/token consumption,
 * linked to the credit operation/transaction that paid for it.
 * This is the unit-economics layer: user-visible credits are deliberately
 * decoupled from actual AI cost.
 */
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * @param {object} admin - optional service-role client (injected for tests)
 * @param {object} input
 * @returns {Promise<object>} the inserted ai_usage row
 */
export async function recordAiUsage(
  admin,
  {
    userId,
    operationSlug,
    feature,
    provider = null,
    model = null,
    inputTokens = 0,
    outputTokens = 0,
    totalTokens = 0,
    estimatedCost = null,
    creditOperationId = null,
    creditTransactionId = null,
    referenceId = null,
  }
) {
  const client = admin || getAdminClient();
  const { data, error } = await client
    .from('ai_usage')
    .insert({
      user_id: userId,
      operation_slug: operationSlug,
      feature,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      credit_operation_id: creditOperationId,
      credit_transaction_id: creditTransactionId,
      reference_id: referenceId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

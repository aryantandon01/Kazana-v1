/**
 * Transaction display helpers for the credit UI.
 */

export const TRANSACTION_TYPE_LABELS = {
  grant: 'Welcome grant',
  subscription_grant: 'Monthly credits',
  promotional_bonus: 'Promotional bonus',
  referral_bonus: 'Referral bonus',
  usage: 'AI usage',
  purchase: 'Credit purchase',
  refund: 'Refund',
  expiration: 'Credits expired',
  adjustment: 'Adjustment',
  admin_adjustment: 'Adjustment',
};

/** Resolve a human-readable label for a ledger row (usage → operation name). */
export function transactionLabel(tx, operationsMap = {}) {
  if (tx.transaction_type === 'usage' && operationsMap[tx.operation_slug]) {
    return operationsMap[tx.operation_slug].display_name;
  }
  return TRANSACTION_TYPE_LABELS[tx.transaction_type] || tx.transaction_type;
}

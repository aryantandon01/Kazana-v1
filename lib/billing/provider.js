/**
 * Payment provider abstraction — Kazana's internal systems only ever observe
 * business events ("Premium subscription became active"). Payment providers
 * are replaceable; the credit system never couples to Stripe/Razorpay/etc.
 *
 * The default provider is a no-op. Wiring a real provider is a documented
 * follow-up step (see docs/credits.md — "Enabling real payments").
 */
export class PaymentProvider {
  /** @returns {Promise<{ providerCustomerId: string|null }>} */
  async createCustomer() {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{ providerSubscriptionId: string|null }>} */
  async createSubscription() {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{ ok: boolean }>} */
  async cancelSubscription() {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{ ok: boolean, event?: object }>} */
  async verifyWebhook() {
    throw new Error('Not implemented');
  }

  /** Handle a verified provider event → emit internal business events. */
  async handlePayment() {
    throw new Error('Not implemented');
  }
}

/** Default no-op provider — safe until a real provider is configured. */
export class NullPaymentProvider extends PaymentProvider {
  async createCustomer() {
    return { providerCustomerId: null };
  }

  async createSubscription() {
    return { providerSubscriptionId: null };
  }

  async cancelSubscription() {
    return { ok: true };
  }

  async verifyWebhook() {
    return { ok: false, reason: 'no_payment_provider_configured' };
  }

  async handlePayment() {
    return { ok: false, reason: 'no_payment_provider_configured' };
  }
}

let providerInstance = null;

/** Resolve the active payment provider (env-selected in the future). */
export function getPaymentProvider() {
  if (!providerInstance) providerInstance = new NullPaymentProvider();
  return providerInstance;
}

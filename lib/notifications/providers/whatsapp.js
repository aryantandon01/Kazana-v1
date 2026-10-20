import { assertProvider } from './provider.js';

const DEFAULT_BASE_URL = 'https://graph.facebook.com/v21.0';

/**
 * All WhatsApp credentials come from the environment. Nothing is hard-coded and
 * no placeholder secrets are used — when the vars are absent the channel is
 * simply "not configured" and the worker defers delivery instead of failing.
 */
function readConfig() {
  return {
    baseUrl: process.env.WHATSAPP_API_BASE_URL || DEFAULT_BASE_URL,
    token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    template: process.env.WHATSAPP_JOB_MATCH_TEMPLATE || 'job_match_alert',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
  };
}

/** True when both the access token and phone-number id are present. */
export function isWhatsAppConfigured() {
  const { token, phoneNumberId } = readConfig();
  return Boolean(token && phoneNumberId);
}

/**
 * Template body parameters, in order, for the approved `job_match_alert` template:
 *   {{1}} job title · {{2}} company · {{3}} match score %
 *
 * Cloud API rejects empty text parameters (131009/132018), which would turn a
 * missing company name into a permanently failed notification. Always send a
 * non-empty placeholder instead.
 */
export function buildTemplateParams(notification = {}) {
  const score = notification.scorePercent;
  return [
    notification.jobTitle || notification.title || 'A new role',
    notification.companyName || 'a company',
    score !== null && score !== undefined && score !== '' ? String(score) : '0',
  ];
}

/**
 * WhatsApp Cloud API provider.
 *
 * Sends a pre-approved *template* message (Meta requires templates for
 * business-initiated messages) with three body variables:
 *   {{1}} job title · {{2}} company · {{3}} match score %
 *
 * @param {{ fetchImpl?: typeof fetch }} [options] injectable for tests
 */
export function createWhatsAppProvider({ fetchImpl = globalThis.fetch } = {}) {
  return assertProvider({
    channel: 'whatsapp',
    async send({ to, notification }) {
      const { baseUrl, token, phoneNumberId, template, language } = readConfig();
      if (!token || !phoneNumberId) throw new Error('whatsapp_not_configured');
      if (!to) throw new Error('whatsapp_missing_recipient');

      const params = buildTemplateParams(notification);

      const res = await fetchImpl(`${baseUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              {
                type: 'body',
                parameters: params.map((text) => ({ type: 'text', text: String(text) })),
              },
            ],
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = new Error(data?.error?.message || `whatsapp_http_${res.status}`);
        err.status = res.status;
        err.provider = 'whatsapp';
        throw err;
      }

      return { messageId: data?.messages?.[0]?.id || null };
    },
  });
}

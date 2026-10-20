import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createWhatsAppProvider,
  buildTemplateParams,
  isWhatsAppConfigured,
} from '@/lib/notifications/providers/whatsapp';

const ORIGINAL_ENV = { ...process.env };

describe('WhatsApp provider', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_JOB_MATCH_TEMPLATE = 'job_match_alert';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'en';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('posts an approved template message with the job-match parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.TEST' }] }),
    });

    const result = await createWhatsAppProvider({ fetchImpl }).send({
      to: '+14155550123',
      notification: { title: 'New match', body: 'x', jobTitle: 'Backend Engineer', companyName: 'Stripe', scorePercent: 92 },
    });

    expect(result).toEqual({ messageId: 'wamid.TEST' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '+14155550123', type: 'template' });
    expect(body.template.name).toBe('job_match_alert');
    expect(body.template.language).toEqual({ code: 'en' });
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(['Backend Engineer', 'Stripe', '92']);
  });

  it('surfaces the provider error message and HTTP status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Template does not exist' } }),
    });

    await expect(
      createWhatsAppProvider({ fetchImpl }).send({ to: '+14155550123', notification: {} }),
    ).rejects.toMatchObject({ message: 'Template does not exist', status: 400 });
  });

  it('refuses to send without a recipient', async () => {
    const fetchImpl = vi.fn();
    await expect(createWhatsAppProvider({ fetchImpl }).send({ to: null, notification: {} })).rejects.toThrow(
      'whatsapp_missing_recipient',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports not-configured rather than guessing credentials', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = '';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '';

    expect(isWhatsAppConfigured()).toBe(false);
    await expect(
      createWhatsAppProvider({ fetchImpl: vi.fn() }).send({ to: '+14155550123', notification: {} }),
    ).rejects.toThrow('whatsapp_not_configured');
  });

  it('falls back to non-empty template parameters', () => {
    // Cloud API rejects empty text parameters, so a missing title/company/score
    // must still produce a sendable message.
    expect(buildTemplateParams({ title: 'New role' })).toEqual(['New role', 'a company', '0']);
    expect(buildTemplateParams({})).toEqual(['A new role', 'a company', '0']);
    expect(buildTemplateParams({ jobTitle: 'PM', companyName: 'Acme', scorePercent: 0 })).toEqual([
      'PM',
      'Acme',
      '0',
    ]);
  });
});

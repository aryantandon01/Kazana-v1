import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { internalError, notFound, rateLimited, validationError } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/notifications/providers';
import { isTestNotificationsEnabled } from '@/lib/notifications/config';
import { normalizePhone } from '@/lib/notifications/phone';

const testSchema = z.object({
  channel: z.enum(['push', 'whatsapp']),
  message: z.string().trim().min(1).max(300).optional(),
});

/**
 * POST /api/notifications/test — dev-only delivery probe.
 *
 * Disabled (404) unless ENABLE_NOTIFICATION_TEST=true so it can never be used
 * to message real recipients in production. The recipient is always resolved
 * from the *caller's own* preferences/tokens — the body cannot specify one.
 */
export async function POST(request) {
  if (!isTestNotificationsEnabled()) return notFound();

  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  const ip = getClientIp(request);
  if (!rateLimit(`notifications-test:${user.id || ip}`, { limit: 5 })) return rateLimited();

  try {
    const parsed = testSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error.flatten().fieldErrors);
    const { channel, message } = parsed.data;

    const notification = {
      title: 'Kazana test notification',
      body: message || 'This is a test notification from Kazana.',
      payload: { type: 'test', channel },
      jobTitle: 'Test role',
      companyName: 'Kazana',
      scorePercent: 90,
    };

    let to;
    if (channel === 'whatsapp') {
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('whatsapp_phone')
        .eq('user_id', user.id)
        .maybeSingle();
      to = normalizePhone(prefs?.whatsapp_phone);
      if (!to) {
        return validationError({ whatsapp_phone: ['Add a WhatsApp number in Settings first.'] });
      }
    } else {
      const { data: tokens } = await getAdminClient()
        .from('device_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('is_active', true);
      to = (tokens || []).map((t) => t.token);
      if (!to.length) {
        return validationError({ device: ['Register a mobile device first.'] });
      }
    }

    const { messageId } = await getProvider(channel).send({ to, notification });

    return NextResponse.json({
      data: { channel, sent: true, provider_message_id: messageId || null },
    });
  } catch (err) {
    console.error('POST /api/notifications/test', err);
    return internalError(err.message);
  }
}

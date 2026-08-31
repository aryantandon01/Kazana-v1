import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/errors';
import { runNotifications } from '@/lib/notifications/dispatch';

export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } }, { status: 401 });
  }

  try {
    const result = await runNotifications();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('POST /api/cron/notify', err);
    return internalError();
  }
}

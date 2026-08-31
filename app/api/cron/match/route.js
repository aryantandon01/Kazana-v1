import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/errors';
import { runMatching } from '@/lib/matching/run';

/**
 * Cron endpoint: match recent jobs. Protect with CRON_SECRET header.
 */
export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } }, { status: 401 });
  }

  try {
    const result = await runMatching({ sinceHours: 48 });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('POST /api/cron/match', err);
    return internalError();
  }
}

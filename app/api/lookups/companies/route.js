import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { internalError, rateLimited } from '@/lib/api/errors';

async function searchLookup(table, q, columns = 'name') {
  const supabase = await createClient();
  let query = supabase.from(table).select(columns).order('name', { ascending: true }).limit(100);

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function lookupHandler(table, columns) {
  return async function GET(request) {
    const ip = getClientIp(request);
    if (!rateLimit(`lookup-${table}:${ip}`, { limit: 180 })) {
      return rateLimited();
    }

    try {
      const { searchParams } = new URL(request.url);
      const q = searchParams.get('q') || '';
      const data = await searchLookup(table, q, columns);
      return NextResponse.json({ data });
    } catch (err) {
      console.error(`GET /api/lookups/${table}`, err);
      return internalError();
    }
  };
}

export const GET = lookupHandler('companies', 'name');

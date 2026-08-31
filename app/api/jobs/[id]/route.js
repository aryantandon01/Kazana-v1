import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { internalError, notFound } from '@/lib/api/errors';
import { jobListSelect, shapeJobSemantics } from '@/lib/jobs/semantic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    let { data, error } = await supabase
      .from('jobs')
      .select(jobListSelect())
      .eq('id', id)
      .single();

    if (error && isSemanticSelectError(error)) {
      const retry = await supabase
        .from('jobs')
        .select('*, job_sources(name, slug, license)')
        .eq('id', id)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) return notFound('Job not found');

    return NextResponse.json({ data: shapeJobSemantics(data) });
  } catch (err) {
    console.error('GET /api/jobs/[id]', err);
    return internalError();
  }
}

function isSemanticSelectError(error) {
  const message = error?.message || '';
  return (
    message.includes('job_facets') ||
    message.includes('job_tags') ||
    message.includes('schema cache') ||
    message.includes('Could not find')
  );
}

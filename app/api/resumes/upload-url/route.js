import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { internalError, validationError } from '@/lib/api/errors';
import { uploadUrlSchema } from '@/lib/validation/resume';

export async function POST(request) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = uploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.flatten().fieldErrors);
    }

    const { filename, contentType } = parsed.data;
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/${Date.now()}-${sanitized}`;

    const admin = getAdminClient();
    const { data, error } = await admin.storage
      .from('resumes')
      .createSignedUploadUrl(filePath);

    if (error) throw error;

    const { data: publicData } = admin.storage.from('resumes').getPublicUrl(filePath);

    return NextResponse.json({
      data: {
        path: filePath,
        signedUrl: data.signedUrl,
        token: data.token,
        publicUrl: publicData.publicUrl,
        contentType,
      },
    });
  } catch (err) {
    console.error('POST /api/resumes/upload-url', err);
    return internalError(err.message?.includes('SERVICE_ROLE') ? err.message : undefined);
  }
}

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, validationError } from '@/lib/api/errors';
import { deviceRegisterSchema } from '@/lib/validation/discovery';

export async function POST(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = deviceRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.flatten().fieldErrors);
    }

    const { token, platform } = parsed.data;

    const { data, error } = await supabase
      .from('device_tokens')
      .upsert(
        { user_id: user.id, token, platform, is_active: true },
        { onConflict: 'user_id,token' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/devices', err);
    return internalError();
  }
}

export async function DELETE(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body?.token) {
      return validationError([{ field: 'token', message: 'Required' }]);
    }

    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('token', body.token);

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('DELETE /api/devices', err);
    return internalError();
  }
}

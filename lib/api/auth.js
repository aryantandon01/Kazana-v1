import { createClient } from '@/lib/supabase/server';
import { unauthorized } from '@/lib/api/errors';

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase };
  }

  return { user, supabase };
}

export async function requireAuth() {
  const { user, supabase } = await getAuthUser();
  if (!user) {
    return { error: unauthorized(), user: null, supabase: null };
  }
  return { user, supabase, error: null };
}

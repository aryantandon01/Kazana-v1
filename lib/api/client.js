import { createClient } from '@/lib/supabase/client';

export async function apiFetch(path, options = {}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(message);
  }

  return data;
}

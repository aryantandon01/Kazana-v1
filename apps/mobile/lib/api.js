import { supabase } from './supabase';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};
const API_BASE = extra.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText);
  }
  return data;
}

export { API_BASE };

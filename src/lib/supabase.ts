import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getFunctionUrl(name: string, path = '') {
  if (!supabaseUrl) throw new Error('Supabase URL is not configured');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${supabaseUrl}/functions/v1/${name}${path ? normalizedPath : ''}`;
}

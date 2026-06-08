import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

export type AuthenticatedUser = { id: string } | null;

export async function getAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string): Promise<AuthenticatedUser> {
  const authorization = req.headers.get('authorization') || '';
  const match = /^bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

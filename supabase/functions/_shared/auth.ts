import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

type AuthIdentity = {
  provider?: string;
  identity_data?: Record<string, unknown>;
};

export type AuthenticatedUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  identities?: AuthIdentity[];
} | null;

function envList(name: string) {
  return new Set(
    (Deno.env.get(name) || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function providerValues(user: NonNullable<AuthenticatedUser>) {
  const values = new Set<string>();
  const provider = stringValue(user.app_metadata?.provider);
  if (provider) values.add(provider);
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers)) {
    providers.forEach((value) => {
      const normalized = stringValue(value);
      if (normalized) values.add(normalized);
    });
  }
  user.identities?.forEach((identity) => {
    const normalized = stringValue(identity.provider);
    if (normalized) values.add(normalized);
  });
  return values;
}

export async function getAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string): Promise<AuthenticatedUser> {
  const authorization = req.headers.get('authorization') || '';
  const match = /^bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user as AuthenticatedUser;
}

export function isAdminUser(user: AuthenticatedUser) {
  if (!user) return false;

  const adminUserIds = envList('ADMIN_USER_IDS');
  if (adminUserIds.has(user.id.toLowerCase())) return true;

  const adminEmails = envList('ADMIN_EMAILS');
  if (adminEmails.has(stringValue(user.email))) return true;

  const adminGithubUsernames = envList('ADMIN_GITHUB_USERNAMES');
  if (!adminGithubUsernames.size || !providerValues(user).has('github')) return false;

  return (user.identities || []).some((identity) => {
    if (stringValue(identity.provider) !== 'github') return false;
    const data = identity.identity_data || {};
    const username = stringValue(data.user_name) || stringValue(data.preferred_username) || stringValue(data.nickname);
    return adminGithubUsernames.has(username);
  });
}

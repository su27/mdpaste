// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  ANONYMOUS_DAILY_UPLOAD_LIMIT,
  AUTHENTICATED_DAILY_UPLOAD_LIMIT,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  identityForRequest,
} from '../_shared/security.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type User = { id: string } | null;

async function getUser(req: Request): Promise<User> {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

async function consumeUploadQuota(req: Request, user: User) {
  const identity = await identityForRequest(req, user?.id);
  const limit = user ? AUTHENTICATED_DAILY_UPLOAD_LIMIT : ANONYMOUS_DAILY_UPLOAD_LIMIT;
  const { data, error } = await service.rpc('consume_quota', {
    p_scope: 'upload',
    p_identity_type: identity.type,
    p_identity_key: identity.key,
    p_limit: limit,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) return { allowed: false, remaining: 0, limit };
  return { allowed: true, remaining: row.remaining as number, limit };
}

function extensionForType(type: string) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/webp') return 'webp';
  return 'bin';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  try {
    const user = await getUser(req);
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return errorResponse('file required');
    if (!IMAGE_MIME_TYPES.has(file.type)) return errorResponse('unsupported image type');
    if (file.size > MAX_IMAGE_BYTES) return errorResponse('image too large', 413);

    const quota = await consumeUploadQuota(req, user);
    if (!quota.allowed) return errorResponse('daily upload limit exceeded', 429, { limit: quota.limit, remaining: 0 });

    const ext = extensionForType(file.type);
    const scope = user ? `users/${user.id}` : 'anonymous';
    const objectPath = `${scope}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await service.storage.from('paste-images').upload(objectPath, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw error;
    const { data } = service.storage.from('paste-images').getPublicUrl(objectPath);
    return jsonResponse({ url: data.publicUrl, path: objectPath, remaining: quota.remaining }, 201);
  } catch (error) {
    console.error(error);
    if (error instanceof Error) return errorResponse(error.message, error.message.includes('large') ? 413 : 400);
    return errorResponse('internal error', 500);
  }
});

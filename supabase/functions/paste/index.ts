// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  ANONYMOUS_DAILY_PASTE_LIMIT,
  AUTHENTICATED_DAILY_PASTE_LIMIT,
  HTML,
  extractTitle,
  identityForRequest,
  normalizeContentType,
  normalizeVisibility,
  randomSlug,
  sanitizeHtmlContent,
  validateContent,
  validateTitle,
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

function slugFromUrl(req: Request) {
  const { pathname } = new URL(req.url);
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf('paste');
  return index >= 0 ? parts[index + 1] : undefined;
}

async function readJson(req: Request) {
  try {
    const data = await req.json();
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('json object required');
    }
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === 'json object required') throw error;
    throw new Error('invalid json');
  }
}

function validationErrorStatus(error: Error) {
  if (error.message.includes('too large')) return 413;
  if (error.message === 'auth required') return 401;
  return 400;
}

function parsePositiveInt(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value || '', 10);
  const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(normalized, max) : normalized;
}

async function consumePasteQuota(req: Request, user: User) {
  const identity = await identityForRequest(req, user?.id);
  const limit = user ? AUTHENTICATED_DAILY_PASTE_LIMIT : ANONYMOUS_DAILY_PASTE_LIMIT;
  const { data, error } = await service.rpc('consume_quota', {
    p_scope: 'paste',
    p_identity_type: identity.type,
    p_identity_key: identity.key,
    p_limit: limit,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) return { allowed: false, remaining: 0, limit };
  return { allowed: true, remaining: row.remaining as number, limit };
}

function preparePayload(data: Record<string, unknown>, existing?: any) {
  const isCreate = !existing;
  const contentType = normalizeContentType(data.content_type, existing?.content_type || 'markdown');
  const hasContent = Object.prototype.hasOwnProperty.call(data, 'content');
  const rawContent = hasContent
    ? validateContent(data.content, true)
    : validateContent(undefined, isCreate, existing?.content || '');
  const content = contentType === HTML ? sanitizeHtmlContent(rawContent) : rawContent;
  const title = validateTitle(data.title, existing?.title || '') || extractTitle(rawContent, contentType);
  const requestedVisibility = data.visibility ?? (data.is_private === true ? 'private' : undefined);
  const visibility = normalizeVisibility(requestedVisibility, existing?.visibility || 'public');
  return {
    title,
    content,
    content_type: contentType,
    visibility,
    sanitized: contentType === HTML,
  };
}

async function createPaste(req: Request, user: User) {
  const data = await readJson(req);
  const payload = preparePayload(data);
  if (payload.visibility === 'private' && !user) throw new Error('auth required');

  const quota = await consumePasteQuota(req, user);
  if (!quota.allowed) {
    return errorResponse('daily paste limit exceeded', 429, { limit: quota.limit, remaining: 0 });
  }

  const identity = await identityForRequest(req, user?.id);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = randomSlug();
    const { data: inserted, error } = await service
      .from('pastes')
      .insert({
        slug,
        title: payload.title,
        content: payload.content,
        content_type: payload.content_type,
        visibility: payload.visibility,
        owner_id: user?.id ?? null,
        ip_hash: user ? null : identity.key,
        sanitized: payload.sanitized,
      })
      .select('slug,title,content_type,visibility,created_at,updated_at')
      .single();
    if (!error) return jsonResponse({ ...inserted, url: `/p/${slug}`, remaining: quota.remaining }, 201);
    if (error.code !== '23505') throw error;
  }
  return errorResponse('could not allocate slug', 500);
}

async function getPaste(slug: string, user: User) {
  const { data, error } = await service
    .from('pastes')
    .select('slug,title,content,content_type,visibility,owner_id,sanitized,created_at,updated_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return errorResponse('not found', 404);
  if (data.visibility === 'private' && data.owner_id !== user?.id) return errorResponse('not found', 404);
  const { owner_id: _ownerId, ...safe } = data;
  return jsonResponse({ ...safe, is_owner: data.owner_id === user?.id, url: `/p/${slug}` });
}

async function listPastes(req: Request, user: User) {
  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get('page'), 1);
  const pageSize = parsePositiveInt(url.searchParams.get('page_size'), 20, 50);
  const mine = url.searchParams.get('mine') === '1';
  const q = (url.searchParams.get('q') || '').trim().slice(0, 120).replace(/[,%()]/g, ' ');
  if (mine && !user) return errorResponse('auth required', 401);

  let query = service
    .from('pastes')
    .select('slug,title,content,content_type,visibility,owner_id,created_at,updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (mine) query = query.eq('owner_id', user!.id);
  else query = query.eq('visibility', 'public');
  if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return jsonResponse({
    page,
    page_size: pageSize,
    total: count || 0,
    pastes: (data || []).map((paste: any) => ({
      slug: paste.slug,
      title: paste.title,
      excerpt: String(paste.content || '').slice(0, 180),
      content_type: paste.content_type,
      visibility: paste.visibility,
      created_at: paste.created_at,
      updated_at: paste.updated_at,
      is_owner: paste.owner_id === user?.id,
      url: `/p/${paste.slug}`,
    })),
  });
}

async function updatePaste(slug: string, req: Request, user: User) {
  if (!user) return errorResponse('auth required', 401);
  const { data: existing, error } = await service.from('pastes').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!existing) return errorResponse('not found', 404);
  if (existing.owner_id !== user.id) return errorResponse('forbidden', 403);

  const data = await readJson(req);
  const payload = preparePayload(data, existing);
  if (payload.visibility === 'private' && !user) throw new Error('auth required');

  const { data: updated, error: updateError } = await service
    .from('pastes')
    .update({
      title: payload.title,
      content: payload.content,
      content_type: payload.content_type,
      visibility: payload.visibility,
      sanitized: payload.sanitized,
    })
    .eq('slug', slug)
    .select('slug,title,content_type,visibility,created_at,updated_at')
    .single();
  if (updateError) throw updateError;
  return jsonResponse({ ...updated, url: `/p/${slug}` });
}

async function deletePaste(slug: string, user: User) {
  if (!user) return errorResponse('auth required', 401);
  const { data: existing, error } = await service.from('pastes').select('owner_id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!existing) return errorResponse('not found', 404);
  if (existing.owner_id !== user.id) return errorResponse('forbidden', 403);
  const { error: deleteError } = await service.from('pastes').delete().eq('slug', slug);
  if (deleteError) throw deleteError;
  return jsonResponse({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const slug = slugFromUrl(req);
    if (req.method === 'GET' && !slug) return await listPastes(req, user);
    if (req.method === 'POST' && !slug) return await createPaste(req, user);
    if (!slug) return errorResponse('not found', 404);
    if (req.method === 'GET') return await getPaste(slug, user);
    if (req.method === 'PUT') return await updatePaste(slug, req, user);
    if (req.method === 'DELETE') return await deletePaste(slug, user);
    return errorResponse('method not allowed', 405);
  } catch (error) {
    console.error(error);
    if (error instanceof Error) return errorResponse(error.message, validationErrorStatus(error));
    return errorResponse('internal error', 500);
  }
});

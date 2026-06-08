import { getFunctionUrl, supabase, supabaseAnonKey } from './supabase';
import type { Paste, PasteCreateResponse, PasteDraft, PasteListResponse, UploadImageResponse } from '../types';

class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function authHeaders() {
  const headers: Record<string, string> = {};
  if (supabaseAnonKey) headers.apikey = supabaseAnonKey;
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

async function request<T>(path = '', init: RequestInit = {}) {
  const headers = {
    ...(await authHeaders()),
    ...(init.headers || {}),
  } as Record<string, string>;
  return parseResponse<T>(await fetch(getFunctionUrl('paste', path), { ...init, headers }));
}

export async function listPastes(params: { mine?: boolean; q?: string; page?: number } = {}) {
  const search = new URLSearchParams();
  if (params.mine) search.set('mine', '1');
  if (params.q) search.set('q', params.q);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const query = search.toString();
  return request<PasteListResponse>(query ? `?${query}` : '');
}

export async function getPaste(slug: string) {
  return request<Paste>(`/${encodeURIComponent(slug)}`);
}

export async function createPaste(draft: PasteDraft) {
  return request<PasteCreateResponse>('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
}

export async function updatePaste(slug: string, draft: PasteDraft) {
  return request<PasteCreateResponse>(`/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
}

export async function deletePaste(slug: string) {
  return request<{ ok: true }>(`/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'image');
  const headers = await authHeaders();
  return parseResponse<UploadImageResponse>(await fetch(getFunctionUrl('upload-image'), {
    method: 'POST',
    headers,
    body: formData,
  }));
}

export { ApiError };

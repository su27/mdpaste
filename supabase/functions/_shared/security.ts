import sanitizeHtml from 'https://esm.sh/sanitize-html@2.17.4';

export const MAX_TITLE_LENGTH = 256;
export const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
export const MARKDOWN = 'markdown';
export const HTML = 'html';
export const CONTENT_TYPES = new Set([MARKDOWN, HTML]);
export const VISIBILITIES = new Set(['public', 'unlisted', 'private']);
export const AUTHENTICATED_DAILY_PASTE_LIMIT = 1000;
export const ANONYMOUS_DAILY_PASTE_LIMIT = 100;
export const AUTHENTICATED_DAILY_UPLOAD_LIMIT = 3000;
export const ANONYMOUS_DAILY_UPLOAD_LIMIT = 300;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export type ContentType = 'markdown' | 'html';
export type Visibility = 'public' | 'unlisted' | 'private';

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function normalizeContentType(value: unknown, fallback: ContentType = MARKDOWN): ContentType {
  if (value == null) return fallback;
  if (typeof value !== 'string' || !CONTENT_TYPES.has(value)) throw new Error('content_type invalid');
  return value as ContentType;
}

export function normalizeVisibility(value: unknown, fallback: Visibility = 'public'): Visibility {
  if (value == null) return fallback;
  if (typeof value !== 'string' || !VISIBILITIES.has(value)) throw new Error('visibility invalid');
  return value as Visibility;
}

export function validateTitle(value: unknown, fallback = '') {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new Error('title must be string');
  if (value.length > MAX_TITLE_LENGTH) throw new Error('title too long');
  return value.trim();
}

export function validateContent(value: unknown, required = true, fallback = '') {
  if (value == null) {
    if (required) throw new Error('content required');
    return fallback;
  }
  if (typeof value !== 'string') throw new Error('content must be string');
  if (!value.trim()) throw new Error('content required');
  if (byteLength(value) > MAX_CONTENT_LENGTH) throw new Error('content too large');
  return value;
}

export function sanitizeHtmlContent(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del',
      'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small',
      'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul'
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      '*': ['aria-label', 'title']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https']
    },
    allowProtocolRelative: false,
    allowedClasses: {},
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName: string, attribs: Record<string, string>) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'nofollow noopener noreferrer',
        },
      }),
      img: (_tagName: string, attribs: Record<string, string>) => ({
        tagName: 'img',
        attribs: {
          ...attribs,
          loading: 'lazy',
        },
      }),
    },
  });
}

export function extractMarkdownTitle(content: string) {
  for (const line of content.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line.trim());
    if (match) return match[1].slice(0, MAX_TITLE_LENGTH);
  }
  return '';
}

export function extractHtmlTitle(content: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1]
    || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(content)?.[1]
    || '';
  return title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

export function extractTitle(content: string, contentType: ContentType) {
  return contentType === HTML ? extractHtmlTitle(content) : extractMarkdownTitle(content);
}

export function randomSlug(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function getClientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'unknown';
  return ip;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function identityForRequest(req: Request, userId?: string) {
  if (userId) return { type: 'user', key: userId };
  const secret = Deno.env.get('IP_HASH_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'dev-secret';
  const ipHash = await sha256Hex(`${secret}:${getClientIp(req)}`);
  return { type: 'ip', key: ipHash };
}

# Security Notes

md-paste is intended to be safe enough for public traffic. The important controls live server-side so API clients cannot bypass them.

## HTML Pastes

HTML content is sanitized in `supabase/functions/_shared/security.ts` before insertion or update.

The sanitizer:

- Allows a small document-oriented tag set such as headings, paragraphs, lists, tables, code, blockquote, and images.
- Removes script-capable tags such as `script`, `style`, `iframe`, `object`, `embed`, `svg`, `math`, forms, and inputs.
- Removes event handlers and inline styles by only allowing explicit safe attributes.
- Allows link URLs with `http`, `https`, and `mailto` schemes.
- Allows image URLs with `http` and `https` only.
- Adds `target="_blank"` and `rel="nofollow noopener noreferrer"` to links.
- Adds lazy loading to images.

The React client sanitizes HTML again for previews and display. This is defense in depth; the server sanitizer is the authoritative boundary.

## Markdown Pastes

Markdown is stored as text and rendered by React without raw HTML parsing. The renderer uses:

- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-sanitize`
- `rehype-katex`
- `rehype-highlight`

Markdown links and images are URL-allowlisted in the client. `data:` image URLs are not rendered. Use the image upload endpoint instead.

## Image Uploads

Images are uploaded through `supabase/functions/upload-image/index.ts` into the public `paste-images` bucket.

Allowed types:

- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`

Not allowed:

- SVG files
- HTML files
- Generic attachments
- `data:` image URLs

The default maximum image size is 10 MB.

## Quotas

Paste quotas are enforced by `public.consume_quota()` and called from the `paste` Edge Function before insert.

- Anonymous users: 100 pastes per IP hash per day.
- Signed-in users: 1000 pastes per user ID per day.

Image upload quotas use the same table under the `upload` scope.

Anonymous identities are hashes of the request IP plus `IP_HASH_SECRET`. Set `IP_HASH_SECRET` as a Supabase secret in production.

## Row Level Security

RLS is enabled for `public.pastes` and `public.rate_limits`.

Direct client reads are intentionally narrow:

- Public pastes are directly readable.
- Owners can directly read their own pastes.

Direct public insert/update/delete policies are not provided. All writes go through Edge Functions with the service role key so validation, sanitization, quotas, and ownership checks stay centralized.

## Operational Checklist

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Edge Function secrets.
- Never expose the service role key to the Vite client.
- Set `IP_HASH_SECRET` before production launch.
- Keep `verify_jwt = false` only for functions that intentionally support anonymous access.
- Review sanitizer allowlists before allowing new HTML tags, attributes, or URL schemes.

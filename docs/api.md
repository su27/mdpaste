# API

All write paths go through Supabase Edge Functions so rate limits, ownership checks, and HTML sanitization are enforced server-side.

Set these examples first:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-public-anon-key"
# Optional for authenticated owner/private operations:
export ACCESS_TOKEN="user-jwt-from-supabase-auth"
```

Use `Authorization: Bearer $ACCESS_TOKEN` for authenticated requests. Anonymous requests can omit it.

## Create Paste

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example",
    "content": "# Hello\n\nA public Markdown paste.",
    "content_type": "markdown",
    "visibility": "public"
  }'
```

Response:

```json
{
  "slug": "AbCdEf2345",
  "title": "Example",
  "content_type": "markdown",
  "visibility": "public",
  "created_at": "2026-06-08T00:00:00Z",
  "updated_at": "2026-06-08T00:00:00Z",
  "url": "/p/AbCdEf2345",
  "remaining": 99
}
```

### HTML Paste

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Safe HTML",
    "content": "<h1>Hello</h1><script>alert(1)</script><p>world</p>",
    "content_type": "html",
    "visibility": "unlisted"
  }'
```

The stored content is sanitized before it reaches Postgres.

## Read Paste

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste/AbCdEf2345" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

Private pastes require the owner's access token. A configured administrator can also read private pastes by slug.

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste/AbCdEf2345" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## List Public Pastes

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste?page=1&q=hello" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

## List My Pastes

```bash
curl -sS "$SUPABASE_URL/functions/v1/paste?mine=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

For administrators, `mine=1` returns all pastes and includes `admin_view: true` in the response.

## Update Paste

Only the owner or a configured administrator can update a paste.

```bash
curl -sS -X PUT "$SUPABASE_URL/functions/v1/paste/AbCdEf2345" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "content": "Updated content",
    "content_type": "markdown",
    "visibility": "private"
  }'
```

## Delete Paste

Only the owner or a configured administrator can delete a paste.

```bash
curl -sS -X DELETE "$SUPABASE_URL/functions/v1/paste/AbCdEf2345" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Upload Image

Only raster images are accepted: PNG, JPEG, GIF, and WebP. Maximum size is 10 MB.

```bash
curl -sS "$SUPABASE_URL/functions/v1/upload-image" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./image.png"
```

Response:

```json
{
  "url": "https://your-project.supabase.co/storage/v1/object/public/paste-images/users/.../image.png",
  "path": "users/.../image.png",
  "remaining": 2999
}
```

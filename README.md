# md-paste

A small public paste app for Markdown and sanitized HTML, backed by Supabase.

md-paste is a clean-room, open-source rewrite of an internal paste tool. It removes all private infrastructure assumptions and uses Supabase for the backend: Postgres, Auth, Storage, Row Level Security, and Edge Functions.

## Features

- Markdown pastes with GFM tables, task lists, math, syntax highlighting, and a low-key editor toolbar.
- HTML pastes sanitized in a Supabase Edge Function before storage.
- Supabase Auth login with GitHub or Google.
- Public, unlisted, and private visibility.
- Image uploads through Supabase Storage (`paste-images` bucket), inserted as Markdown or HTML images.
- Daily paste quotas enforced server-side:
  - Anonymous users: 100 pastes per IP hash per day.
  - Signed-in users: 1000 pastes per user per day.
- CRUD API via Edge Functions for browser clients, scripts, and AI agents.

## Architecture

| Layer | Technology |
| --- | --- |
| Client | Vite + React static app |
| API | Supabase Edge Functions (`paste`, `upload-image`) |
| Auth | Supabase Auth OAuth providers: GitHub and Google |
| Database | Supabase Postgres with RLS |
| File storage | Supabase Storage public bucket for raster images |
| Security controls | HTML sanitizer, URL scheme allowlists, server-side quotas |

Supabase provides the backend runtime. The Vite client builds to static files and can be served by any static host or edge/static platform you prefer.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the client

```bash
cp .env.example .env.local
```

Fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

### 3. Start Supabase locally or link a project

Use the Supabase CLI to start a local stack or link an existing hosted project:

```bash
supabase start
supabase db push
supabase functions serve --env-file .env.local
```

For hosted Supabase:

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase secrets set IP_HASH_SECRET=replace-with-a-long-random-string
supabase functions deploy paste
supabase functions deploy upload-image
```

The Edge Functions also use the standard Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment variables.

### 4. Enable OAuth providers

In the Supabase dashboard, enable GitHub and Google providers under Auth providers. Add your local and production URLs to Auth redirect URLs, for example:

```text
http://localhost:5173
https://your-domain.example
```

### 5. Run the web app

```bash
npm run dev
```

Open `http://localhost:5173`.

## API

The browser uses Supabase Edge Functions, but they are plain HTTP endpoints and are useful from scripts too. See `docs/api.md` for CRUD examples.

## Security Model

- HTML is sanitized on write by `supabase/functions/paste/index.ts`.
- Markdown is rendered without raw HTML support in the React client.
- Client-side HTML preview is sanitized as defense in depth.
- Image uploads only accept PNG, JPEG, GIF, and WebP. SVG and `data:` image URLs are intentionally not supported.
- Direct database writes are blocked by RLS; create/update/delete goes through Edge Functions so quotas and sanitization cannot be bypassed by the public client.

More details are in `docs/security.md`.

## Scripts

```bash
npm run dev      # Vite dev server
npm run build    # TypeScript build + Vite production build
npm run preview  # Preview the production build
npm run lint     # TypeScript check
```

## License

MIT

## Supabase References

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Auth social login](https://supabase.com/docs/guides/auth/social-login)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

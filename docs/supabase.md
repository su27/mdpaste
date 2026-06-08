# Supabase Deployment Guide

This project uses Supabase for the backend runtime: Postgres, Auth, Storage, and Edge Functions. The web client is a static Vite build.

## Required Supabase Components

- Database tables:
  - `public.pastes`
  - `public.rate_limits`
- RPC:
  - `public.consume_quota(scope, identity_type, identity_key, limit)`
- Storage bucket:
  - `paste-images`, public, 10 MB file limit, PNG/JPEG/GIF/WebP only
- Edge Functions:
  - `paste`
  - `upload-image`
  - `app`
- Auth providers:
  - GitHub
  - Google

The migration at `supabase/migrations/0001_initial.sql` creates the database schema, RLS policies, quota function, and Storage bucket.

## Local Development

Install the Supabase CLI, then run:

```bash
supabase start
supabase db push
```

Create `.env.local` for the Vite client:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key from supabase status>
```

Serve Edge Functions locally:

```bash
supabase functions serve --env-file .env.local
```

Run the client:

```bash
npm run dev
```

## Hosted Project Deployment

Link the repository to your hosted Supabase project:

```bash
supabase login
supabase link --project-ref your-project-ref
```

Apply database migrations:

```bash
supabase db push
```

Set the IP hash secret. Use a long random value; changing it resets anonymous quota identities.

```bash
supabase secrets set IP_HASH_SECRET="$(openssl rand -hex 32)"
```

Deploy functions:

```bash
supabase functions deploy paste
supabase functions deploy upload-image
supabase functions deploy app
```

The deployed functions receive these Supabase-provided variables automatically:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`IP_HASH_SECRET` is optional but recommended. If it is not set, the service role key is used as the fallback salt.

## Auth Configuration

In the Supabase dashboard:

1. Go to Authentication -> Providers.
2. Enable GitHub and Google.
3. Add provider client IDs/secrets from their developer consoles.
4. Add redirect URLs for local and production deployments:

```text
http://localhost:5173
https://your-domain.example
https://<project-ref>.supabase.co/functions/v1/app
```

The React client calls `supabase.auth.signInWithOAuth()` and redirects back to the current page.

`supabase/config.toml` keeps local Auth defaults. For production, prefer setting OAuth providers and redirect URLs in the dashboard, or carefully edit the `[auth]` section before running `supabase config push`.

## Function JWT Verification

`supabase/config.toml` sets:

```toml
[functions.paste]
verify_jwt = false

[functions.upload-image]
verify_jwt = false
```

This allows anonymous paste creation and image upload. When a user is signed in, the client still sends `Authorization: Bearer <access-token>`; each function validates it with Supabase Auth before allowing owner/private operations.

## Frontend Hosting on Supabase

The repository includes an `app` Edge Function that serves the built Vite SPA from `supabase/functions/app/dist`.

Build the static client for the function path:

```bash
npm run build:supabase
```

Deploy the function:

```bash
supabase functions deploy app
```

The app URL is:

```text
https://<project-ref>.supabase.co/functions/v1/app
```

Configure Supabase Auth redirect URLs to include that URL. The Vite app is base-path aware, so routes like `/p/:slug` resolve under `/functions/v1/app/p/:slug` when deployed this way.

## References

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Auth social login](https://supabase.com/docs/guides/auth/social-login)
- [Supabase Storage](https://supabase.com/docs/guides/storage)

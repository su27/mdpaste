create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pastes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{8,24}$'),
  title text not null default '' check (char_length(title) <= 256),
  content text not null check (octet_length(content) <= 2097152),
  content_type text not null default 'markdown' check (content_type in ('markdown', 'html')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  owner_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  sanitized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pastes_public_created on public.pastes (created_at desc) where visibility = 'public';
create index if not exists idx_pastes_owner_created on public.pastes (owner_id, created_at desc);
create index if not exists idx_pastes_slug on public.pastes (slug);

create table if not exists public.rate_limits (
  day date not null,
  scope text not null check (scope in ('paste', 'upload')),
  identity_type text not null check (identity_type in ('user', 'ip')),
  identity_key text not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, scope, identity_type, identity_key)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pastes_touch_updated_at on public.pastes;
create trigger trg_pastes_touch_updated_at
before update on public.pastes
for each row execute function public.touch_updated_at();

create or replace function public.consume_quota(
  p_scope text,
  p_identity_type text,
  p_identity_key text,
  p_limit integer
)
returns table(allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if p_limit <= 0 then
    return query select false, 0;
    return;
  end if;

  loop
    update public.rate_limits
       set count = count + 1,
           updated_at = now()
     where day = current_date
       and scope = p_scope
       and identity_type = p_identity_type
       and identity_key = p_identity_key
       and count < p_limit
     returning count into new_count;

    if found then
      return query select true, greatest(p_limit - new_count, 0);
      return;
    end if;

    begin
      insert into public.rate_limits(day, scope, identity_type, identity_key, count)
      values (current_date, p_scope, p_identity_type, p_identity_key, 1);
      return query select true, greatest(p_limit - 1, 0);
      return;
    exception when unique_violation then
      select count into new_count
        from public.rate_limits
       where day = current_date
         and scope = p_scope
         and identity_type = p_identity_type
         and identity_key = p_identity_key;
      if new_count >= p_limit then
        return query select false, 0;
        return;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.consume_quota(text, text, text, integer) from public;
grant execute on function public.consume_quota(text, text, text, integer) to service_role;

alter table public.pastes enable row level security;
alter table public.rate_limits enable row level security;

-- Direct client access is intentionally read-only and narrow. Edge Functions own
-- all create/update/delete paths so they can apply quotas and sanitize HTML.
drop policy if exists "Public pastes are directly readable" on public.pastes;
create policy "Public pastes are directly readable"
  on public.pastes for select
  using (visibility = 'public');

drop policy if exists "Owners can directly read their pastes" on public.pastes;
create policy "Owners can directly read their pastes"
  on public.pastes for select
  using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paste-images',
  'paste-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read paste images" on storage.objects;
create policy "Public can read paste images"
  on storage.objects for select
  using (bucket_id = 'paste-images');

-- Buyer's Packet — initial schema
-- Tables: buyers, properties
-- v1 single-agent model: Nikki is hardcoded as the only agent.
-- Auth: Supabase magic-link email login.
-- RLS: agent has full access, buyers read-only on their own rows.

-- ─── Tables ─────────────────────────────────────────────────────

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists buyers_email_unique
  on public.buyers (lower(email));

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  street text,
  city text,
  state text,
  zip text,
  packet_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_buyer_id
  on public.properties (buyer_id);

-- ─── updated_at trigger ─────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists buyers_set_updated_at on public.buyers;
create trigger buyers_set_updated_at
  before update on public.buyers
  for each row execute function public.set_updated_at();

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ─── Helper functions for RLS ───────────────────────────────────

-- Get the email of the currently-authenticated user.
create or replace function public.current_user_email()
returns text as $$
  select email from auth.users where id = auth.uid()
$$ language sql security definer stable;

-- Is the current user the agent (Nikki)?
-- Single-agent v1: hardcoded email allowlist.
create or replace function public.is_agent()
returns boolean as $$
  select coalesce(public.current_user_email() = 'nikki@kw.com', false)
$$ language sql security definer stable;

-- ─── RLS ────────────────────────────────────────────────────────

alter table public.buyers enable row level security;
alter table public.properties enable row level security;

-- Buyers table policies
drop policy if exists "agent_full_access_buyers" on public.buyers;
create policy "agent_full_access_buyers"
  on public.buyers for all
  using (public.is_agent())
  with check (public.is_agent());

drop policy if exists "buyer_read_own_buyer_row" on public.buyers;
create policy "buyer_read_own_buyer_row"
  on public.buyers for select
  using (lower(email) = lower(public.current_user_email()));

-- Properties table policies
drop policy if exists "agent_full_access_properties" on public.properties;
create policy "agent_full_access_properties"
  on public.properties for all
  using (public.is_agent())
  with check (public.is_agent());

drop policy if exists "buyer_read_own_properties" on public.properties;
create policy "buyer_read_own_properties"
  on public.properties for select
  using (
    buyer_id in (
      select id from public.buyers
      where lower(email) = lower(public.current_user_email())
    )
  );

-- Add support for multiple emails per buyer.
-- A buyer may sign in via the primary `email` OR any address in
-- `additional_emails`. RLS policies that key off the user's email
-- now match against either source.

alter table public.buyers
  add column if not exists additional_emails text[] not null default '{}';

-- ─── Refresh RLS policies that check email match ────────────────

drop policy if exists "buyer_read_own_buyer_row" on public.buyers;
create policy "buyer_read_own_buyer_row"
  on public.buyers for select
  using (
    lower(email) = lower(public.current_user_email())
    or lower(public.current_user_email()) = any (
      array(select lower(e) from unnest(additional_emails) e)
    )
  );

drop policy if exists "buyer_read_own_properties" on public.properties;
create policy "buyer_read_own_properties"
  on public.properties for select
  using (
    buyer_id in (
      select id from public.buyers
      where lower(email) = lower(public.current_user_email())
        or lower(public.current_user_email()) = any (
          array(select lower(e) from unnest(additional_emails) e)
        )
    )
  );

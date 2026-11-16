-- Push subscriptions for the daily event reminder. Run once in the Supabase SQL editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  last_reminder_on date,
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 1 and 2000),
  constraint push_subscriptions_key_length check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 200)
);

create index if not exists push_subscriptions_account_idx on public.push_subscriptions (account_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

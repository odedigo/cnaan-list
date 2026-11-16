-- Per-account switch for event reminder notifications. Run once in the Supabase SQL editor.

alter table public.accounts add column if not exists event_reminders boolean not null default true;

drop policy if exists "update own event reminders" on public.accounts;
create policy "update own event reminders"
  on public.accounts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant update (event_reminders) on public.accounts to authenticated;

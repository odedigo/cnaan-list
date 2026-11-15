-- Important events (ארועים). Run once in the Supabase SQL editor.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null,
  name text not null,
  label text not null default '',
  month smallint not null,
  day smallint not null,
  year integer,
  comments text not null default '',
  image_path text,
  constraint events_kind_check check (kind in ('birthday', 'anniversary', 'death', 'passing', 'other')),
  constraint events_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint events_label_length check (char_length(label) <= 80),
  constraint events_other_label check (kind <> 'other' or char_length(btrim(label)) between 1 and 80),
  constraint events_month_check check (month between 1 and 12),
  constraint events_day_check check (day between 1 and 31),
  constraint events_year_check check (year is null or year between 1 and 9999),
  constraint events_comments_length check (char_length(comments) <= 1000)
);

create index events_account_idx on public.events (account_id);

alter table public.events enable row level security;

create policy "own events"
  on public.events for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

revoke all on public.events from anon;
grant select, insert, update, delete on public.events to authenticated;

alter table public.events replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

-- Checklist rows for the רשימות page. Run once in the Supabase SQL editor.

create table public.checklist_rows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  body text not null default '',
  indent smallint not null default 0,
  checked boolean not null default false,
  sort_order integer not null default 0,
  constraint checklist_rows_indent_check check (indent in (0, 1))
);

create index checklist_rows_account_sort_idx on public.checklist_rows (account_id, sort_order);

alter table public.checklist_rows enable row level security;

create policy "own checklist rows"
  on public.checklist_rows for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

revoke all on public.checklist_rows from anon;
grant select, insert, update, delete on public.checklist_rows to authenticated;

alter table public.checklist_rows replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.checklist_rows;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

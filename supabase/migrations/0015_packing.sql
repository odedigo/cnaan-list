-- Packing lists for trips. Run once in the Supabase SQL editor.

create table public.packing_lists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  favorite boolean not null default false,
  sort_order integer not null default 0,
  constraint packing_lists_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.packing_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  list_id uuid not null references public.packing_lists (id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  sort_order integer not null default 0,
  constraint packing_categories_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint packing_categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid not null references public.packing_categories (id) on delete cascade,
  name text not null,
  quantity numeric(10, 2) not null default 1,
  checked boolean not null default false,
  sort_order integer not null default 0,
  constraint packing_items_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint packing_items_quantity_check check (quantity >= 0.01)
);

create index packing_lists_account_sort_idx on public.packing_lists (account_id, sort_order);
create index packing_categories_list_sort_idx on public.packing_categories (list_id, sort_order);
create index packing_items_category_sort_idx on public.packing_items (category_id, sort_order);

alter table public.packing_lists enable row level security;
alter table public.packing_categories enable row level security;
alter table public.packing_items enable row level security;

create policy "own packing lists"
  on public.packing_lists for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

create policy "own packing categories"
  on public.packing_categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.packing_lists as list
      where list.id = list_id and list.account_id = packing_categories.account_id
    )
  );

create policy "own packing items"
  on public.packing_items for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.packing_categories as category
      where category.id = category_id and category.account_id = packing_items.account_id
    )
  );

revoke all on public.packing_lists from anon;
revoke all on public.packing_categories from anon;
revoke all on public.packing_items from anon;

grant select, insert, update, delete on public.packing_lists to authenticated;
grant select, insert, update, delete on public.packing_categories to authenticated;
grant select, insert, update, delete on public.packing_items to authenticated;

alter table public.packing_lists replica identity full;
alter table public.packing_categories replica identity full;
alter table public.packing_items replica identity full;

do $$
declare
  target regclass;
begin
  foreach target in array array[
    'public.packing_lists'::regclass,
    'public.packing_categories'::regclass,
    'public.packing_items'::regclass
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table %s', target);
    exception
      when duplicate_object then null;
      when others then
        if sqlerrm ilike '%already member%' then null;
        else raise;
        end if;
    end;
  end loop;
end $$;

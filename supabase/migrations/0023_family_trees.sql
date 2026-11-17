-- Family trees (עצי משפחה). Run once in the Supabase SQL editor.

create table public.family_trees (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint family_trees_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.family_people (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  given_name text not null default '',
  surname text not null default '',
  sex text not null default 'u',
  birth_date text not null default '',
  birth_place text not null default '',
  death_date text not null default '',
  death_place text not null default '',
  note text not null default '',
  constraint family_people_sex_check check (sex in ('m', 'f', 'u')),
  constraint family_people_given_length check (char_length(given_name) <= 80),
  constraint family_people_surname_length check (char_length(surname) <= 80),
  constraint family_people_birth_date_length check (char_length(birth_date) <= 80),
  constraint family_people_birth_place_length check (char_length(birth_place) <= 120),
  constraint family_people_death_date_length check (char_length(death_date) <= 80),
  constraint family_people_death_place_length check (char_length(death_place) <= 120),
  constraint family_people_note_length check (char_length(note) <= 1000)
);

create table public.family_unions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  partner_a uuid not null references public.family_people (id) on delete cascade,
  partner_b uuid references public.family_people (id) on delete set null,
  constraint family_unions_distinct check (partner_b is null or partner_a <> partner_b)
);

create table public.family_children (
  union_id uuid not null references public.family_unions (id) on delete cascade,
  person_id uuid not null references public.family_people (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (union_id, person_id)
);

create index family_trees_account_sort_idx on public.family_trees (account_id, sort_order);
create index family_people_tree_idx on public.family_people (tree_id);
create index family_unions_tree_idx on public.family_unions (tree_id);
create index family_children_person_idx on public.family_children (person_id);

alter table public.family_trees enable row level security;
alter table public.family_people enable row level security;
alter table public.family_unions enable row level security;
alter table public.family_children enable row level security;

create policy "own family trees"
  on public.family_trees for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

create policy "own family people"
  on public.family_people for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.family_trees as tree
      where tree.id = tree_id and tree.account_id = family_people.account_id
    )
  );

create policy "own family unions"
  on public.family_unions for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.family_trees as tree
      where tree.id = tree_id and tree.account_id = family_unions.account_id
    )
    and exists (
      select 1 from public.family_people as person
      where person.id = partner_a
        and person.tree_id = family_unions.tree_id
        and person.account_id = family_unions.account_id
    )
    and (
      partner_b is null
      or exists (
        select 1 from public.family_people as person
        where person.id = partner_b
          and person.tree_id = family_unions.tree_id
          and person.account_id = family_unions.account_id
      )
    )
  );

create policy "own family children"
  on public.family_children for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1
      from public.family_unions as union_row
      join public.family_people as child on child.id = person_id
      where union_row.id = union_id
        and union_row.account_id = family_children.account_id
        and child.account_id = family_children.account_id
        and child.tree_id = union_row.tree_id
        and child.id <> union_row.partner_a
        and (union_row.partner_b is null or child.id <> union_row.partner_b)
    )
  );

revoke all on public.family_trees from anon;
revoke all on public.family_people from anon;
revoke all on public.family_unions from anon;
revoke all on public.family_children from anon;

grant select, insert, update, delete on public.family_trees to authenticated;
grant select, insert, update, delete on public.family_people to authenticated;
grant select, insert, update, delete on public.family_unions to authenticated;
grant select, insert, update, delete on public.family_children to authenticated;

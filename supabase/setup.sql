-- CnaanList database structure.
-- Paste this into the SQL editor of a new Supabase project and run it once.
-- It creates an empty schema: tables, security, the private image buckets, and Realtime.
-- It does not copy users, lists, or photos from another project.
-- Running it again on the same project is safe.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text not null,
  role text not null default 'USER',
  user_type text not null default 'NORM',
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_א-ת]{3,24}$'),
  constraint profiles_role_check check (role in ('USER', 'ADMIN')),
  constraint profiles_user_type_check check (user_type in ('NORM', 'PRO', 'PREMIUM'))
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

alter table public.profiles add column if not exists role text not null default 'USER';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('USER', 'ADMIN'));

alter table public.profiles add column if not exists user_type text not null default 'NORM';
alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles add constraint profiles_user_type_check check (user_type in ('NORM', 'PRO', 'PREMIUM'));

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  event_reminders boolean not null default true,
  sections text[] not null default array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar'],
  constraint accounts_sections_check check (sections <@ array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar']::text[])
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  color text not null,
  sort_order integer not null default 0,
  protected boolean not null default false,
  constraint stores_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint stores_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  image_path text,
  sort_order integer not null default 0,
  store_id uuid references public.stores (id),
  separator_after boolean not null default false,
  separator_text text not null default '',
  constraint categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  comments text not null default '',
  image_path text,
  quantity numeric(10, 2) not null default 1,
  sort_order integer not null default 0,
  constraint items_unit_check check (unit in ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bag', 'bottle', 'handful')),
  constraint items_quantity_check check (quantity >= 0.01)
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  checked boolean not null default false
);

create table if not exists public.checklist_rows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  body text not null default '',
  indent smallint not null default 0,
  checked boolean not null default false,
  sort_order integer not null default 0,
  priority text,
  constraint checklist_rows_indent_check check (indent in (0, 1)),
  constraint checklist_rows_priority_check check (priority is null or priority in ('immediate', 'high', 'medium', 'low'))
);

create table if not exists public.packing_lists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  favorite boolean not null default false,
  sort_order integer not null default 0,
  constraint packing_lists_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table if not exists public.packing_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  list_id uuid not null references public.packing_lists (id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  sort_order integer not null default 0,
  constraint packing_categories_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint packing_categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.packing_items (
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

create table if not exists public.events (
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

create table if not exists public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  parent_id uuid references public.recipe_categories (id) on delete cascade,
  name text not null,
  image_path text,
  sort_order integer not null default 0,
  protected boolean not null default false,
  constraint recipe_categories_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint recipe_categories_image_path_length check (image_path is null or char_length(btrim(image_path)) between 1 and 500),
  constraint recipe_categories_parent_not_self check (parent_id is null or parent_id <> id)
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  title text not null,
  leaf_category_id uuid not null references public.recipe_categories (id) on delete cascade,
  source_path text,
  document jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  rating smallint,
  created_at timestamptz not null default now(),
  constraint recipes_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint recipes_source_path_length check (source_path is null or char_length(btrim(source_path)) between 1 and 500),
  constraint recipes_rating_check check (rating is null or rating between 1 and 5)
);

create table if not exists public.recipe_labels (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  category_id uuid not null references public.recipe_categories (id) on delete cascade,
  primary key (recipe_id, category_id)
);

create table if not exists public.family_trees (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint family_trees_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table if not exists public.family_people (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  given_name text not null default '',
  surname text not null default '',
  hebrew_given text not null default '',
  hebrew_surname text not null default '',
  sex text not null default 'u',
  birth_date text not null default '',
  birth_place text not null default '',
  death_date text not null default '',
  death_place text not null default '',
  note text not null default '',
  deceased boolean not null default false,
  image_path text,
  link_id uuid,
  constraint family_people_sex_check check (sex in ('m', 'f', 'u')),
  constraint family_people_given_length check (char_length(given_name) <= 80),
  constraint family_people_surname_length check (char_length(surname) <= 80),
  constraint family_people_hebrew_given_length check (char_length(hebrew_given) <= 80),
  constraint family_people_hebrew_surname_length check (char_length(hebrew_surname) <= 80),
  constraint family_people_birth_date_length check (char_length(birth_date) <= 80),
  constraint family_people_birth_place_length check (char_length(birth_place) <= 120),
  constraint family_people_death_date_length check (char_length(death_date) <= 80),
  constraint family_people_death_place_length check (char_length(death_place) <= 120),
  constraint family_people_note_length check (char_length(note) <= 1000),
  nickname text not null default '',
  cause_of_death text not null default '',
  occupation text not null default '',
  source text not null default '',
  media text not null default '',
  constraint family_people_nickname_length check (char_length(nickname) <= 120),
  constraint family_people_cause_length check (char_length(cause_of_death) <= 200),
  constraint family_people_occupation_length check (char_length(occupation) <= 1000),
  constraint family_people_source_length check (char_length(source) <= 2000),
  constraint family_people_media_length check (char_length(media) <= 2000),
  constraint family_people_image_path_length check (image_path is null or char_length(btrim(image_path)) between 1 and 500)
);

create table if not exists public.family_unions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  partner_a uuid not null references public.family_people (id) on delete cascade,
  partner_b uuid references public.family_people (id) on delete set null,
  status text not null default 'married',
  constraint family_unions_distinct check (partner_b is null or partner_a <> partner_b),
  constraint family_unions_status_check check (status in ('married', 'divorced', 'widowed', 'separated', 'partner'))
);

create table if not exists public.family_children (
  union_id uuid not null references public.family_unions (id) on delete cascade,
  person_id uuid not null references public.family_people (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (union_id, person_id)
);

alter table public.family_people add column if not exists image_path text;
alter table public.family_people add column if not exists deceased boolean not null default false;
alter table public.family_people add column if not exists hebrew_given text not null default '';
alter table public.family_people add column if not exists hebrew_surname text not null default '';
alter table public.family_people add column if not exists link_id uuid;
alter table public.family_people drop constraint if exists family_people_hebrew_given_length;
alter table public.family_people
  add constraint family_people_hebrew_given_length check (char_length(hebrew_given) <= 80);
alter table public.family_people drop constraint if exists family_people_hebrew_surname_length;
alter table public.family_people
  add constraint family_people_hebrew_surname_length check (char_length(hebrew_surname) <= 80);
alter table public.family_people drop constraint if exists family_people_image_path_length;
alter table public.family_people
  add constraint family_people_image_path_length
  check (image_path is null or char_length(btrim(image_path)) between 1 and 500);

alter table public.family_unions add column if not exists status text not null default 'married';
alter table public.family_unions drop constraint if exists family_unions_status_check;
alter table public.family_unions
  add constraint family_unions_status_check
  check (status in ('married', 'divorced', 'widowed', 'separated', 'partner'));

create index if not exists stores_account_sort_idx on public.stores (account_id, sort_order);
create unique index if not exists stores_account_name_idx on public.stores (account_id, lower(name));
create unique index if not exists stores_one_protected_idx on public.stores (account_id) where protected;
create index if not exists categories_account_sort_idx on public.categories (account_id, sort_order);
create index if not exists items_account_category_sort_idx on public.items (account_id, category_id, sort_order);
create unique index if not exists grocery_account_item_idx on public.grocery_items (account_id, item_id);
create index if not exists checklist_rows_account_sort_idx on public.checklist_rows (account_id, sort_order);
create index if not exists packing_lists_account_sort_idx on public.packing_lists (account_id, sort_order);
create index if not exists packing_categories_list_sort_idx on public.packing_categories (list_id, sort_order);
create index if not exists packing_items_category_sort_idx on public.packing_items (category_id, sort_order);
create index if not exists events_account_idx on public.events (account_id);
create index if not exists push_subscriptions_account_idx on public.push_subscriptions (account_id);
alter table public.recipe_categories add column if not exists protected boolean not null default false;

create unique index if not exists recipe_categories_sibling_name_idx
  on public.recipe_categories (account_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create unique index if not exists recipe_categories_one_protected_idx
  on public.recipe_categories (account_id) where protected;
create index if not exists recipe_categories_account_parent_sort_idx
  on public.recipe_categories (account_id, parent_id, sort_order);
create index if not exists recipes_account_leaf_sort_idx
  on public.recipes (account_id, leaf_category_id, sort_order);
create unique index if not exists recipes_account_source_path_idx
  on public.recipes (account_id, source_path)
  where source_path is not null;
create index if not exists recipe_labels_category_idx
  on public.recipe_labels (category_id);
create index if not exists family_trees_account_sort_idx on public.family_trees (account_id, sort_order);
create index if not exists family_people_tree_idx on public.family_people (tree_id);
create index if not exists family_people_link_idx on public.family_people (account_id, link_id) where link_id is not null;
create index if not exists family_unions_tree_idx on public.family_unions (tree_id);
create index if not exists family_children_person_idx on public.family_children (person_id);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.grocery_items enable row level security;
alter table public.checklist_rows enable row level security;
alter table public.packing_lists enable row level security;
alter table public.packing_categories enable row level security;
alter table public.packing_items enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.recipe_categories enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_labels enable row level security;
alter table public.family_trees enable row level security;
alter table public.family_people enable row level security;
alter table public.family_unions enable row level security;
alter table public.family_children enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "read own account" on public.accounts;
create policy "read own account"
  on public.accounts for select to authenticated
  using (owner_id = auth.uid());

alter table public.accounts add column if not exists event_reminders boolean not null default true;

alter table public.accounts
  add column if not exists sections text[] not null
  default array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar'];

alter table public.accounts drop constraint if exists accounts_sections_check;

update public.accounts
set sections = sections || array['calendar']::text[]
where not (sections @> array['calendar']::text[]);

alter table public.accounts
  alter column sections set default array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar'];

alter table public.accounts
  add constraint accounts_sections_check
  check (sections <@ array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar']::text[]);

drop policy if exists "update own event reminders" on public.accounts;
create policy "update own event reminders"
  on public.accounts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "own stores" on public.stores;
create policy "own stores"
  on public.stores for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own categories" on public.categories;
create policy "own categories"
  on public.categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own items" on public.items;
create policy "own items"
  on public.items for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.categories c
      where c.id = category_id and c.account_id = items.account_id
    )
  );

drop policy if exists "own grocery" on public.grocery_items;
create policy "own grocery"
  on public.grocery_items for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.account_id = grocery_items.account_id
    )
  );

drop policy if exists "own checklist rows" on public.checklist_rows;
create policy "own checklist rows"
  on public.checklist_rows for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own packing lists" on public.packing_lists;
create policy "own packing lists"
  on public.packing_lists for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own packing categories" on public.packing_categories;
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

drop policy if exists "own packing items" on public.packing_items;
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

drop policy if exists "own events" on public.events;
create policy "own events"
  on public.events for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own recipe categories" on public.recipe_categories;
create policy "own recipe categories"
  on public.recipe_categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes"
  on public.recipes for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and exists (
      select 1
      from public.recipe_categories as category
      where category.id = leaf_category_id
        and category.account_id = recipes.account_id
    )
  );

drop policy if exists "own recipe labels" on public.recipe_labels;
create policy "own recipe labels"
  on public.recipe_labels for all to authenticated
  using (
    exists (
      select 1
      from public.recipes as recipe
      join public.accounts as account on account.id = recipe.account_id
      where recipe.id = recipe_id
        and account.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes as recipe
      join public.accounts as account on account.id = recipe.account_id
      join public.recipe_categories as category on category.id = category_id
      where recipe.id = recipe_id
        and account.owner_id = auth.uid()
        and category.account_id = recipe.account_id
    )
  );

drop policy if exists "own family trees" on public.family_trees;
create policy "own family trees"
  on public.family_trees for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

drop policy if exists "own family people" on public.family_people;
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

drop policy if exists "own family unions" on public.family_unions;
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

drop policy if exists "own family children" on public.family_children;
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

revoke all on public.profiles from anon;
revoke all on public.accounts from anon;
revoke all on public.stores from anon;
revoke all on public.categories from anon;
revoke all on public.items from anon;
revoke all on public.grocery_items from anon;
revoke all on public.checklist_rows from anon;
revoke all on public.packing_lists from anon;
revoke all on public.packing_categories from anon;
revoke all on public.packing_items from anon;
revoke all on public.events from anon;
revoke all on public.push_subscriptions from anon;
revoke all on public.recipe_categories from anon;
revoke all on public.recipes from anon;
revoke all on public.recipe_labels from anon;
revoke all on public.family_trees from anon;
revoke all on public.family_people from anon;
revoke all on public.family_unions from anon;
revoke all on public.family_children from anon;

grant select on public.profiles to authenticated;
grant select on public.accounts to authenticated;
grant update (event_reminders) on public.accounts to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;
grant select, insert, update, delete on public.checklist_rows to authenticated;
grant select, insert, update, delete on public.packing_lists to authenticated;
grant select, insert, update, delete on public.packing_categories to authenticated;
grant select, insert, update, delete on public.packing_items to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.recipe_categories to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_labels to authenticated;
grant select, insert, update, delete on public.family_trees to authenticated;
grant select, insert, update, delete on public.family_people to authenticated;
grant select, insert, update, delete on public.family_unions to authenticated;
grant select, insert, update, delete on public.family_children to authenticated;

create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.accounts where owner_id = auth.uid()
$$;

create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(p_username)
  limit 1
$$;

create or replace function public.reorder_categories(ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  account uuid;
  i integer;
begin
  account := public.current_account_id();
  if account is null then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1
    from unnest(ids) as wanted(id)
    where not exists (
      select 1 from public.categories c
      where c.id = wanted.id and c.account_id = account
    )
  ) then
    raise exception 'not allowed';
  end if;
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    update public.categories
    set sort_order = i - 1
    where id = ids[i] and account_id = account;
  end loop;
end;
$$;

create or replace function public.reorder_items(target_category uuid, ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  account uuid;
  i integer;
begin
  account := public.current_account_id();
  if account is null then
    raise exception 'not allowed';
  end if;
  if not exists (
    select 1 from public.categories c
    where c.id = target_category and c.account_id = account
  ) then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1
    from unnest(ids) as wanted(id)
    where not exists (
      select 1 from public.items item
      where item.id = wanted.id
        and item.account_id = account
        and item.category_id = target_category
    )
  ) then
    raise exception 'not allowed';
  end if;
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    update public.items
    set sort_order = i - 1
    where id = ids[i] and account_id = account;
  end loop;
end;
$$;

revoke all on function public.current_account_id() from public, anon, authenticated;
grant execute on function public.current_account_id() to authenticated;

revoke all on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;

revoke all on function public.reorder_categories(uuid[]) from public, anon;
grant execute on function public.reorder_categories(uuid[]) to authenticated;

revoke all on function public.reorder_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid, uuid[]) to authenticated;

create or replace function public.seed_account_stores(target_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stores (account_id, name, color, sort_order, protected)
  select target_account, seeded.name, seeded.color, seeded.sort_order, seeded.protected
  from (
    values
      ('סופר', '#E6E6E6', 0, true),
      ('איטליז', '#C62828', 1, false),
      ('גלגוליה', '#FF6D00', 2, false),
      ('עיר', '#FFD800', 3, false)
  ) as seeded(name, color, sort_order, protected)
  where not exists (
    select 1
    from public.stores as store
    where store.account_id = target_account
      and (
        lower(store.name) = lower(seeded.name)
        or (seeded.protected and store.protected)
      )
  );
end;
$$;

revoke all on function public.seed_account_stores(uuid) from public, anon, authenticated;

create or replace function public.categories_assign_store()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.store_id is null then
    select store.id
    into new.store_id
    from public.stores as store
    where store.account_id = new.account_id
      and store.protected = true
    order by store.sort_order
    limit 1;
  end if;
  if new.store_id is null or not exists (
    select 1
    from public.stores as store
    where store.id = new.store_id
      and store.account_id = new.account_id
  ) then
    raise exception 'store does not belong to this account';
  end if;
  return new;
end;
$$;

revoke all on function public.categories_assign_store() from public, anon;
grant execute on function public.categories_assign_store() to authenticated;

create or replace function public.stores_keep_protected()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.protected := old.protected;
  return new;
end;
$$;

revoke all on function public.stores_keep_protected() from public, anon;
grant execute on function public.stores_keep_protected() to authenticated;

create or replace function public.prevent_protected_store_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback uuid;
begin
  if old.protected then
    raise exception 'default store cannot be deleted';
  end if;
  select store.id
  into fallback
  from public.stores as store
  where store.account_id = old.account_id
    and store.protected = true
  order by store.sort_order
  limit 1;
  if fallback is null then
    raise exception 'default store is missing';
  end if;
  update public.categories
  set store_id = fallback
  where store_id = old.id;
  return old;
end;
$$;

revoke all on function public.prevent_protected_store_delete() from public, anon;
grant execute on function public.prevent_protected_store_delete() to authenticated;

drop trigger if exists stores_keep_protected on public.stores;
create trigger stores_keep_protected
  before update on public.stores
  for each row execute function public.stores_keep_protected();

drop trigger if exists prevent_protected_store_delete on public.stores;
create trigger prevent_protected_store_delete
  before delete on public.stores
  for each row execute function public.prevent_protected_store_delete();

alter table public.categories add column if not exists store_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_store_id_fkey') then
    alter table public.categories
      add constraint categories_store_id_fkey
      foreign key (store_id) references public.stores (id);
  end if;
end $$;

drop trigger if exists categories_assign_store on public.categories;
create trigger categories_assign_store
  before insert or update of store_id, account_id on public.categories
  for each row execute function public.categories_assign_store();

create or replace function public.seed_account_favorites(target_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recipe_categories
  set protected = true,
      parent_id = null,
      name = 'מועדפים'
  where account_id = target_account
    and parent_id is null
    and btrim(name) = 'מועדפים'
    and not protected;

  if not exists (
    select 1
    from public.recipe_categories
    where account_id = target_account
      and protected
  ) then
    insert into public.recipe_categories (account_id, parent_id, name, sort_order, protected)
    select target_account,
      null,
      'מועדפים',
      coalesce((
        select min(category.sort_order) - 1
        from public.recipe_categories as category
        where category.account_id = target_account
          and category.parent_id is null
      ), 0),
      true;
  end if;

  update public.recipe_categories as chosen
  set sort_order = (
    select min(other.sort_order) - 1
    from public.recipe_categories as other
    where other.account_id = chosen.account_id
      and other.parent_id is null
      and other.id <> chosen.id
  )
  where chosen.account_id = target_account
    and chosen.protected
    and exists (
      select 1
      from public.recipe_categories as other
      where other.account_id = chosen.account_id
        and other.parent_id is null
        and other.id <> chosen.id
        and other.sort_order <= chosen.sort_order
    );
end;
$$;

revoke all on function public.seed_account_favorites(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  account uuid;
begin
  uname := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if uname is null then
    raise exception 'username required';
  end if;
  insert into public.profiles (id, username, email)
  values (new.id, uname, new.email);
  insert into public.accounts (owner_id)
  values (new.id)
  returning id into account;
  perform public.seed_account_stores(account);
  perform public.seed_account_favorites(account);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

do $$
declare
  account uuid;
begin
  for account in select id from public.accounts loop
    perform public.seed_account_stores(account);
  end loop;
end $$;

update public.categories as category
set store_id = store.id
from public.stores as store
where store.account_id = category.account_id
  and store.protected = true
  and category.store_id is null;

alter table public.categories alter column store_id set not null;

alter table public.categories add column if not exists separator_after boolean not null default false;

alter table public.categories add column if not exists separator_text text not null default '';

alter table public.checklist_rows add column if not exists priority text;

do $$
begin
  alter table public.checklist_rows
    add constraint checklist_rows_priority_check
    check (priority is null or priority in ('immediate', 'high', 'medium', 'low'));
exception
  when duplicate_object then null;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.recipe_categories_enforce_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.recipe_categories as parent
    where parent.id = new.parent_id
      and parent.account_id = new.account_id
  ) then
    raise exception 'recipe category parent must belong to the same account';
  end if;
  return new;
end;
$$;

create or replace function public.recipes_enforce_leaf_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.recipe_categories as category
    where category.id = new.leaf_category_id
      and category.account_id = new.account_id
  ) then
    raise exception 'recipe leaf category must belong to the same account';
  end if;
  return new;
end;
$$;

create or replace function public.recipe_labels_enforce_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.recipes as recipe
    join public.recipe_categories as category on category.id = new.category_id
    where recipe.id = new.recipe_id
      and category.account_id = recipe.account_id
  ) then
    raise exception 'recipe label must belong to the same account';
  end if;
  return new;
end;
$$;

revoke all on function public.recipe_categories_enforce_account() from public, anon;
revoke all on function public.recipes_enforce_leaf_account() from public, anon;
revoke all on function public.recipe_labels_enforce_account() from public, anon;
grant execute on function public.recipe_categories_enforce_account() to authenticated;
grant execute on function public.recipes_enforce_leaf_account() to authenticated;
grant execute on function public.recipe_labels_enforce_account() to authenticated;

drop trigger if exists recipe_categories_enforce_account on public.recipe_categories;
create trigger recipe_categories_enforce_account
  before insert or update of account_id, parent_id on public.recipe_categories
  for each row execute function public.recipe_categories_enforce_account();

drop trigger if exists recipes_enforce_leaf_account on public.recipes;
create trigger recipes_enforce_leaf_account
  before insert or update of account_id, leaf_category_id on public.recipes
  for each row execute function public.recipes_enforce_leaf_account();

drop trigger if exists recipe_labels_enforce_account on public.recipe_labels;
create trigger recipe_labels_enforce_account
  before insert or update on public.recipe_labels
  for each row execute function public.recipe_labels_enforce_account();

create or replace function public.recipe_categories_keep_protected()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.protected then
    new.protected := true;
    new.parent_id := null;
    new.name := 'מועדפים';
  end if;
  return new;
end;
$$;

revoke all on function public.recipe_categories_keep_protected() from public, anon;
grant execute on function public.recipe_categories_keep_protected() to authenticated;

create or replace function public.prevent_protected_recipe_category_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.protected then
    raise exception 'favorites category cannot be deleted';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_protected_recipe_category_delete() from public, anon;
grant execute on function public.prevent_protected_recipe_category_delete() to authenticated;

drop trigger if exists recipe_categories_keep_protected on public.recipe_categories;
create trigger recipe_categories_keep_protected
  before update on public.recipe_categories
  for each row execute function public.recipe_categories_keep_protected();

drop trigger if exists prevent_protected_recipe_category_delete on public.recipe_categories;
create trigger prevent_protected_recipe_category_delete
  before delete on public.recipe_categories
  for each row execute function public.prevent_protected_recipe_category_delete();

do $$
declare
  account uuid;
begin
  for account in select id from public.accounts loop
    perform public.seed_account_favorites(account);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-images',
  'item-images',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner reads item images" on storage.objects;
create policy "owner reads item images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'item-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner uploads item images" on storage.objects;
create policy "owner uploads item images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner updates item images" on storage.objects;
create policy "owner updates item images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'item-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner deletes item images" on storage.objects;
create policy "owner deletes item images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'item-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner reads recipe images" on storage.objects;
create policy "owner reads recipe images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner uploads recipe images" on storage.objects;
create policy "owner uploads recipe images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner updates recipe images" on storage.objects;
create policy "owner updates recipe images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "owner deletes recipe images" on storage.objects;
create policy "owner deletes recipe images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.accounts a
      where a.owner_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

alter table public.stores replica identity full;
alter table public.categories replica identity full;
alter table public.items replica identity full;
alter table public.grocery_items replica identity full;
alter table public.checklist_rows replica identity full;
alter table public.packing_lists replica identity full;
alter table public.packing_categories replica identity full;
alter table public.packing_items replica identity full;
alter table public.events replica identity full;

do $$
declare
  target regclass;
begin
  foreach target in array array[
    'public.stores'::regclass,
    'public.categories'::regclass,
    'public.items'::regclass,
    'public.grocery_items'::regclass,
    'public.checklist_rows'::regclass,
    'public.packing_lists'::regclass,
    'public.packing_categories'::regclass,
    'public.packing_items'::regclass,
    'public.events'::regclass
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

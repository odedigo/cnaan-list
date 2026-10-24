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
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_א-ת]{3,24}$')
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade
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
  constraint items_unit_check check (unit in ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bag', 'bottle')),
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
  constraint checklist_rows_indent_check check (indent in (0, 1))
);

create table if not exists public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  parent_id uuid references public.recipe_categories (id) on delete cascade,
  name text not null,
  image_path text,
  sort_order integer not null default 0,
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

create index if not exists stores_account_sort_idx on public.stores (account_id, sort_order);
create unique index if not exists stores_account_name_idx on public.stores (account_id, lower(name));
create unique index if not exists stores_one_protected_idx on public.stores (account_id) where protected;
create index if not exists categories_account_sort_idx on public.categories (account_id, sort_order);
create index if not exists items_account_category_sort_idx on public.items (account_id, category_id, sort_order);
create unique index if not exists grocery_account_item_idx on public.grocery_items (account_id, item_id);
create index if not exists checklist_rows_account_sort_idx on public.checklist_rows (account_id, sort_order);
create unique index if not exists recipe_categories_sibling_name_idx
  on public.recipe_categories (account_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create index if not exists recipe_categories_account_parent_sort_idx
  on public.recipe_categories (account_id, parent_id, sort_order);
create index if not exists recipes_account_leaf_sort_idx
  on public.recipes (account_id, leaf_category_id, sort_order);
create unique index if not exists recipes_account_source_path_idx
  on public.recipes (account_id, source_path)
  where source_path is not null;
create index if not exists recipe_labels_category_idx
  on public.recipe_labels (category_id);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.grocery_items enable row level security;
alter table public.checklist_rows enable row level security;
alter table public.recipe_categories enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_labels enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "read own account" on public.accounts;
create policy "read own account"
  on public.accounts for select to authenticated
  using (owner_id = auth.uid());

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

revoke all on public.profiles from anon;
revoke all on public.accounts from anon;
revoke all on public.stores from anon;
revoke all on public.categories from anon;
revoke all on public.items from anon;
revoke all on public.grocery_items from anon;
revoke all on public.checklist_rows from anon;
revoke all on public.recipe_categories from anon;
revoke all on public.recipes from anon;
revoke all on public.recipe_labels from anon;

grant select on public.profiles to authenticated;
grant select on public.accounts to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;
grant select, insert, update, delete on public.checklist_rows to authenticated;
grant select, insert, update, delete on public.recipe_categories to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_labels to authenticated;

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

do $$
declare
  target regclass;
begin
  foreach target in array array[
    'public.stores'::regclass,
    'public.categories'::regclass,
    'public.items'::regclass,
    'public.grocery_items'::regclass,
    'public.checklist_rows'::regclass
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

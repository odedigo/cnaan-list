-- CnaanList initial schema. Run once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text not null,
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_א-ת]{3,24}$')
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  image_path text,
  sort_order integer not null default 0,
  constraint categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.items (
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

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  checked boolean not null default false
);

create index categories_account_sort_idx on public.categories (account_id, sort_order);
create index items_account_category_sort_idx on public.items (account_id, category_id, sort_order);
create unique index grocery_account_item_idx on public.grocery_items (account_id, item_id);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.grocery_items enable row level security;

create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "read own account"
  on public.accounts for select to authenticated
  using (owner_id = auth.uid());

create policy "own categories"
  on public.categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

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

revoke all on public.profiles from anon;
revoke all on public.accounts from anon;
revoke all on public.categories from anon;
revoke all on public.items from anon;
revoke all on public.grocery_items from anon;

grant select on public.profiles to authenticated;
grant select on public.accounts to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if uname is null then
    raise exception 'username required';
  end if;
  insert into public.profiles (id, username, email)
  values (new.id, uname, new.email);
  insert into public.accounts (owner_id)
  values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

alter table public.categories replica identity full;
alter table public.items replica identity full;
alter table public.grocery_items replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.categories;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.items;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.grocery_items;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

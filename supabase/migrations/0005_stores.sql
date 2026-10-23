-- Stores belong to an account. Each category points at one store.
-- Run once in the Supabase SQL editor.
-- Existing categories are assigned that account's סופר store.
-- איטליז starts at #C62828. Its color can be changed later in settings.

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

create index if not exists stores_account_sort_idx on public.stores (account_id, sort_order);
create unique index if not exists stores_account_name_idx on public.stores (account_id, lower(name));
create unique index if not exists stores_one_protected_idx on public.stores (account_id) where protected;

alter table public.stores enable row level security;

drop policy if exists "own stores" on public.stores;
create policy "own stores"
  on public.stores for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

revoke all on public.stores from anon;
grant select, insert, update, delete on public.stores to authenticated;

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

alter table public.stores replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.stores;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm ilike '%already member%' then null;
    else raise;
    end if;
end $$;

-- Pin a protected root category named מועדפים. It stays first and cannot be deleted.
-- Run once in the Supabase SQL editor.

alter table public.recipe_categories
  add column if not exists protected boolean not null default false;

create unique index if not exists recipe_categories_one_protected_idx
  on public.recipe_categories (account_id) where protected;

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
    perform public.seed_account_favorites(account);
  end loop;
end $$;

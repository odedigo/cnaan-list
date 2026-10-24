-- Recipes belong to an account.
-- Categories nest. A recipe is labeled with its folder and every parent folder.
-- The document is the recipe JSON without image blobs. Photos live in recipe-images.
-- Run once in the Supabase SQL editor. Running it again is safe.

create table if not exists public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  parent_id uuid references public.recipe_categories (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  constraint recipe_categories_name_length check (char_length(btrim(name)) between 1 and 120),
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

alter table public.recipe_categories enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_labels enable row level security;

drop policy if exists "own recipe categories" on public.recipe_categories;
create policy "own recipe categories"
  on public.recipe_categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (
    account_id in (select id from public.accounts where owner_id = auth.uid())
    and (
      parent_id is null
      or exists (
        select 1
        from public.recipe_categories as parent
        where parent.id = parent_id
          and parent.account_id = recipe_categories.account_id
      )
    )
  );

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

revoke all on public.recipe_categories from anon;
revoke all on public.recipes from anon;
revoke all on public.recipe_labels from anon;

grant select, insert, update, delete on public.recipe_categories to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_labels to authenticated;

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

revoke all on function public.recipe_categories_enforce_account() from public, anon, authenticated;
revoke all on function public.recipes_enforce_leaf_account() from public, anon, authenticated;
revoke all on function public.recipe_labels_enforce_account() from public, anon, authenticated;

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

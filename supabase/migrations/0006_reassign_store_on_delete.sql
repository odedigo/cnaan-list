-- Deleting a store moves every category that uses it back to that account's סופר store.
-- Run once in the Supabase SQL editor after 0005_stores.sql.

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

revoke all on function public.categories_assign_store() from public, anon;
grant execute on function public.categories_assign_store() to authenticated;

revoke all on function public.stores_keep_protected() from public, anon;
grant execute on function public.stores_keep_protected() to authenticated;

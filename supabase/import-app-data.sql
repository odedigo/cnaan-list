-- Import app data dumped by dump-app-data.sql into one existing login.
-- Run in the destination project's SQL editor.
--
-- 1. Set target_username to a user that already exists there.
-- 2. Replace the payload between the $cnaanlist_dump$ markers with the dump result.
--
-- The destination account's current categories, items, grocery lines, and checklist rows are replaced.
-- Profiles and auth users are left as they are.
-- Image files in the item-images bucket are not copied. Image paths are kept empty.

do $$
declare
  target_username text := 'cnaan';
  payload jsonb := $cnaanlist_dump$
{"categories":[],"items":[],"grocery_items":[],"checklist_rows":[]}
$cnaanlist_dump$;
  target_account uuid;
  category jsonb;
  item jsonb;
  line jsonb;
  checklist jsonb;
  new_id uuid;
  new_category_id uuid;
  new_item_id uuid;
begin
  select account.id
  into target_account
  from public.accounts as account
  join public.profiles as profile on profile.id = account.owner_id
  where lower(profile.username) = lower(target_username);

  if target_account is null then
    raise exception 'No account found for username %', target_username;
  end if;

  create temp table if not exists id_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;
  truncate id_map;

  delete from public.checklist_rows where account_id = target_account;
  delete from public.categories where account_id = target_account;

  for category in
    select jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb))
  loop
    new_id := gen_random_uuid();
    insert into id_map (old_id, new_id)
    values ((category->>'id')::uuid, new_id);

    insert into public.categories (id, account_id, name, color, image_path, sort_order)
    values (
      new_id,
      target_account,
      category->>'name',
      coalesce(category->>'color', '#2563EB'),
      null,
      coalesce((category->>'sort_order')::integer, 0)
    );
  end loop;

  for item in
    select jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
  loop
    new_category_id := null;
    select map.new_id
    into new_category_id
    from id_map as map
    where map.old_id = (item->>'category_id')::uuid;

    if new_category_id is null then
      continue;
    end if;

    new_id := gen_random_uuid();
    insert into id_map (old_id, new_id)
    values ((item->>'id')::uuid, new_id);

    insert into public.items (
      id,
      account_id,
      category_id,
      name,
      unit,
      comments,
      image_path,
      quantity,
      sort_order
    )
    values (
      new_id,
      target_account,
      new_category_id,
      item->>'name',
      coalesce(item->>'unit', 'unit'),
      coalesce(item->>'comments', ''),
      null,
      greatest(coalesce((item->>'quantity')::numeric, 1), 0.01),
      coalesce((item->>'sort_order')::integer, 0)
    );
  end loop;

  for line in
    select jsonb_array_elements(coalesce(payload->'grocery_items', '[]'::jsonb))
  loop
    new_item_id := null;
    select map.new_id
    into new_item_id
    from id_map as map
    where map.old_id = (line->>'item_id')::uuid;

    if new_item_id is null then
      continue;
    end if;

    insert into public.grocery_items (id, account_id, item_id, checked)
    values (
      gen_random_uuid(),
      target_account,
      new_item_id,
      coalesce((line->>'checked')::boolean, false)
    )
    on conflict (account_id, item_id) do nothing;
  end loop;

  for checklist in
    select jsonb_array_elements(coalesce(payload->'checklist_rows', '[]'::jsonb))
  loop
    insert into public.checklist_rows (id, account_id, body, indent, checked, sort_order)
    values (
      gen_random_uuid(),
      target_account,
      coalesce(checklist->>'body', ''),
      case when (checklist->>'indent')::integer = 1 then 1 else 0 end,
      coalesce((checklist->>'checked')::boolean, false),
      coalesce((checklist->>'sort_order')::integer, 0)
    );
  end loop;
end $$;

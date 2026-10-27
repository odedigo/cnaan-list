-- Dump app data from this Supabase project.
-- Run in the SQL editor. Copy the single result cell, then paste it into import-app-data.sql.
--
-- Includes categories, items, grocery lines, and checklist rows.
-- Does not include auth users, profiles, or accounts.
-- Does not include files in the item-images bucket.

select jsonb_pretty(
  jsonb_build_object(
    'categories',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', category.id,
            'name', category.name,
            'color', category.color,
            'image_path', category.image_path,
            'sort_order', category.sort_order,
            'separator_after', category.separator_after,
            'separator_text', category.separator_text,
            'store', (
              select store.name
              from public.stores as store
              where store.id = category.store_id
            )
          )
          order by category.sort_order, category.name
        )
        from public.categories as category
      ),
      '[]'::jsonb
    ),
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'category_id', item.category_id,
            'name', item.name,
            'unit', item.unit,
            'comments', item.comments,
            'image_path', item.image_path,
            'quantity', item.quantity,
            'sort_order', item.sort_order
          )
          order by item.sort_order, item.name
        )
        from public.items as item
      ),
      '[]'::jsonb
    ),
    'grocery_items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', line.id,
            'item_id', line.item_id,
            'checked', line.checked
          )
          order by line.item_id
        )
        from public.grocery_items as line
      ),
      '[]'::jsonb
    ),
    'checklist_rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', row.id,
            'body', row.body,
            'indent', row.indent,
            'checked', row.checked,
            'sort_order', row.sort_order,
            'priority', row.priority
          )
          order by row.sort_order
        )
        from public.checklist_rows as row
      ),
      '[]'::jsonb
    )
  )
);

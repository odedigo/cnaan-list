-- Allow חופן as a product unit. Run once in the Supabase SQL editor.

alter table public.items drop constraint if exists items_unit_check;

alter table public.items
  add constraint items_unit_check
  check (unit in ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bag', 'bottle', 'handful'));

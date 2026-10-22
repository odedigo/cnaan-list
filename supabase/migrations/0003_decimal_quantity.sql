-- Allow quantities such as 0.3 and 1.5. Run once in the Supabase SQL editor.

alter table public.items drop constraint if exists items_quantity_check;
alter table public.items add constraint items_quantity_check check (quantity >= 0.01);

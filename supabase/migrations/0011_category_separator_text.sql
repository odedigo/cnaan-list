-- Optional text drawn on the inventory separator after a category.
-- Run once in the Supabase SQL editor.

alter table public.categories
  add column if not exists separator_text text not null default '';

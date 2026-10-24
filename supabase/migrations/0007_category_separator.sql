-- A category can draw a separator after itself on the inventory list.
-- Run once in the Supabase SQL editor.

alter table public.categories
  add column if not exists separator_after boolean not null default false;

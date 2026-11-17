-- Marks a family-tree person as deceased even when no death date is known. Run once in the Supabase SQL editor.

alter table public.family_people
  add column if not exists deceased boolean not null default false;

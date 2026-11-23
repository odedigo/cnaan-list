-- A family tree is one GEDCOM file. People, unions, and children are no longer stored as rows.

alter table public.family_trees
  add column if not exists gedcom text not null default '';

drop table if exists public.family_children;
drop table if exists public.family_unions;
drop table if exists public.family_people;

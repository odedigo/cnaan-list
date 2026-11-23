-- Marks one photo as the card thumbnail. Run once in the Supabase SQL editor.

alter table public.family_person_images
  add column if not exists thumbnail boolean not null default false;

create unique index if not exists family_person_images_one_thumbnail_idx
  on public.family_person_images (tree_id, person_xref)
  where thumbnail;

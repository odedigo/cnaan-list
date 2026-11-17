-- Optional photo on a family-tree person. Run once in the Supabase SQL editor.

alter table public.family_people
  add column if not exists image_path text;

alter table public.family_people
  drop constraint if exists family_people_image_path_length;

alter table public.family_people
  add constraint family_people_image_path_length
  check (image_path is null or char_length(btrim(image_path)) between 1 and 500);

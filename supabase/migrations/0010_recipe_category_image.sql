-- A recipe category can show a photo on its tile.
-- The file lives in the recipe-images bucket. This column stores the path only.
-- Run once in the Supabase SQL editor after 0009_recipe_category_policy.sql.
-- Running it again is safe.

alter table public.recipe_categories
  add column if not exists image_path text;

alter table public.recipe_categories
  drop constraint if exists recipe_categories_image_path_length;

alter table public.recipe_categories
  add constraint recipe_categories_image_path_length
  check (image_path is null or char_length(btrim(image_path)) between 1 and 500);

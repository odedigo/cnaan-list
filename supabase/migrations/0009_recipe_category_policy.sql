-- Follow-up to 0008_recipes.sql. Run this after that script, not instead of it.
-- The category policy in 0008 reads recipe_categories inside its own check,
-- so Postgres rejects inserts with infinite recursion.
-- 0008 also revoked execute on the trigger functions from authenticated.
-- Running this again is safe. Tables, recipes, and images are left as they are.

drop policy if exists "own recipe categories" on public.recipe_categories;
create policy "own recipe categories"
  on public.recipe_categories for all to authenticated
  using (account_id in (select id from public.accounts where owner_id = auth.uid()))
  with check (account_id in (select id from public.accounts where owner_id = auth.uid()));

revoke all on function public.recipe_categories_enforce_account() from public, anon;
revoke all on function public.recipes_enforce_leaf_account() from public, anon;
revoke all on function public.recipe_labels_enforce_account() from public, anon;
grant execute on function public.recipe_categories_enforce_account() to authenticated;
grant execute on function public.recipes_enforce_leaf_account() to authenticated;
grant execute on function public.recipe_labels_enforce_account() to authenticated;

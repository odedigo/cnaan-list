-- Adds the Hebrew calendar section. Existing accounts receive it. Run once in the Supabase SQL editor.

alter table public.accounts drop constraint if exists accounts_sections_check;

update public.accounts
set sections = sections || array['calendar']::text[]
where not (sections @> array['calendar']::text[]);

alter table public.accounts
  alter column sections set default array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar'];

alter table public.accounts
  add constraint accounts_sections_check
  check (sections <@ array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events', 'calendar']::text[]);

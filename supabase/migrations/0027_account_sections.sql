-- Sections shown for an account. Existing rows receive every section. Run once in the Supabase SQL editor.

alter table public.accounts
  add column if not exists sections text[] not null
  default array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events'];

alter table public.accounts
  drop constraint if exists accounts_sections_check;

alter table public.accounts
  add constraint accounts_sections_check
  check (sections <@ array['shopping', 'lists', 'recipes', 'packing', 'trees', 'events']::text[]);

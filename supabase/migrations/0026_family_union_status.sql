-- Status of a couple: married, divorced, widowed, separated, or partner. Run once in the Supabase SQL editor.

alter table public.family_unions
  add column if not exists status text not null default 'married';

alter table public.family_unions
  drop constraint if exists family_unions_status_check;

alter table public.family_unions
  add constraint family_unions_status_check
  check (status in ('married', 'divorced', 'widowed', 'separated', 'partner'));

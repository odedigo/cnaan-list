-- Profile plan for recipe AI. Run once in the Supabase SQL editor.
-- Existing profiles become NORM. PRO and PREMIUM can use the recipe AI actions.

alter table public.profiles add column if not exists user_type text not null default 'NORM';

alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles
  add constraint profiles_user_type_check check (user_type in ('NORM', 'PRO', 'PREMIUM'));

-- Role on each signed-in user. Run once in the Supabase SQL editor.
-- New signups stay USER. Everyone who already has a profile becomes ADMIN.

alter table public.profiles add column if not exists role text not null default 'USER';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('USER', 'ADMIN'));

update public.profiles set role = 'ADMIN';

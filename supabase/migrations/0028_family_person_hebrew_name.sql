-- Hebrew translation of a person's given name and surname. Run once in the Supabase SQL editor.

alter table public.family_people add column if not exists hebrew_given text not null default '';
alter table public.family_people add column if not exists hebrew_surname text not null default '';

alter table public.family_people drop constraint if exists family_people_hebrew_given_length;
alter table public.family_people
  add constraint family_people_hebrew_given_length check (char_length(hebrew_given) <= 80);

alter table public.family_people drop constraint if exists family_people_hebrew_surname_length;
alter table public.family_people
  add constraint family_people_hebrew_surname_length check (char_length(hebrew_surname) <= 80);

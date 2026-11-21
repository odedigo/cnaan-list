-- Nickname, cause of death, occupation, source, and media from GEDCOM. Run once in the Supabase SQL editor.

alter table public.family_people add column if not exists nickname text not null default '';
alter table public.family_people add column if not exists cause_of_death text not null default '';
alter table public.family_people add column if not exists occupation text not null default '';
alter table public.family_people add column if not exists source text not null default '';
alter table public.family_people add column if not exists media text not null default '';

alter table public.family_people drop constraint if exists family_people_nickname_length;
alter table public.family_people
  add constraint family_people_nickname_length check (char_length(nickname) <= 120);

alter table public.family_people drop constraint if exists family_people_cause_length;
alter table public.family_people
  add constraint family_people_cause_length check (char_length(cause_of_death) <= 200);

alter table public.family_people drop constraint if exists family_people_occupation_length;
alter table public.family_people
  add constraint family_people_occupation_length check (char_length(occupation) <= 1000);

alter table public.family_people drop constraint if exists family_people_source_length;
alter table public.family_people
  add constraint family_people_source_length check (char_length(source) <= 2000);

alter table public.family_people drop constraint if exists family_people_media_length;
alter table public.family_people
  add constraint family_people_media_length check (char_length(media) <= 2000);
